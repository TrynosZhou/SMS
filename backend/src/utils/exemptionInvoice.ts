import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { computeLogisticsFees, recomputeInvoiceTotalsFromLineItems, snapshotFromStudent } from './studentLogisticsInvoice';

const OPEN_STATUSES = [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL];

export function isStaffSiblingExemption(student: Student): boolean {
  return student.isStaffChild === true || student.exemptionType === 'staff_sibling';
}

/** Fixed/percentage: full fees on the invoice; only the balance is reduced. */
export function isBalanceOnlyExemption(student: Student): boolean {
  return (
    student.isExempted === true &&
    (student.exemptionType === 'fixed' || student.exemptionType === 'percentage')
  );
}

function appendDescription(inv: Invoice, note: string): void {
  const trimmed = String(note || '').trim();
  if (!trimmed) return;
  const existing = String(inv.description || '').trim();
  inv.description = existing ? `${existing} | ${trimmed}` : trimmed;
}

function updateInvoiceStatus(inv: Invoice, paidAmount: number, newBalance: number): void {
  if (newBalance <= 0.005) {
    inv.status = InvoiceStatus.PAID;
  } else if (paidAmount > 0.005) {
    inv.status = InvoiceStatus.PARTIAL;
  } else if (inv.dueDate && new Date(inv.dueDate) < new Date() && newBalance > 0.005) {
    inv.status = InvoiceStatus.OVERDUE;
  } else {
    inv.status = InvoiceStatus.PENDING;
  }
}

/** Staff sibling: no tuition, registration, desk, or transport; 50% DH only if applicable. */
function computeStaffSiblingLineItems(
  student: Student,
  fees: Record<string, unknown>
): {
  tuition: number;
  transport: number;
  dining: number;
  registration: number;
  desk: number;
} {
  const diningHallCost = parseAmount((fees as any).diningHallCost ?? (fees as any).diningHallFee);
  let dining = 0;
  if (student.usesDiningHall && diningHallCost > 0) {
    dining = parseFloat((diningHallCost * 0.5).toFixed(2));
  }
  return { tuition: 0, transport: 0, dining, registration: 0, desk: 0 };
}

/**
 * Standard payable line items (tuition, reg, desk, transport, full DH).
 * Used for fixed/percentage exemptions before balance adjustment.
 */
function computeStandardPayableLineItems(
  student: Student,
  fees: Record<string, unknown>,
  inv: Invoice
): {
  tuition: number;
  transport: number;
  dining: number;
  registration: number;
  desk: number;
} {
  const dayScholarTuition = parseAmount((fees as any).dayScholarTuitionFee);
  const boarderTuition = parseAmount((fees as any).boarderTuitionFee);
  const registrationFee = parseAmount((fees as any).registrationFee);
  const deskFee = parseAmount((fees as any).deskFee);
  const studentStatus = String((student as any).studentStatus || 'New').trim();
  const isNew = studentStatus.toLowerCase() === 'new';

  const snap = {
    studentType: student.studentType,
    usesTransport: student.usesTransport === true,
    usesDiningHall: student.usesDiningHall === true,
    isStaffChild: false,
    isExempted: false
  };
  const logistics = computeLogisticsFees(snap, fees);
  const tuition =
    student.studentType === 'Boarder'
      ? parseFloat(boarderTuition.toFixed(2))
      : parseFloat(dayScholarTuition.toFixed(2));

  let registration = parseAmount(inv.registrationAmount);
  let desk = parseAmount(inv.deskFeeAmount);
  if (isNew) {
    if (registration <= 0 && registrationFee > 0) {
      registration = parseFloat(registrationFee.toFixed(2));
    }
    if (desk <= 0 && deskFee > 0) {
      desk = parseFloat(deskFee.toFixed(2));
    }
  }

  return {
    tuition: tuition > 0 ? tuition : 0,
    transport: logistics.transport,
    dining: logistics.diningHall,
    registration,
    desk
  };
}

/** Line items for the active exemption type. */
function computeBaseTermLineItems(
  student: Student,
  fees: Record<string, unknown>,
  inv: Invoice
): {
  tuition: number;
  transport: number;
  dining: number;
  registration: number;
  desk: number;
} {
  if (isStaffSiblingExemption(student)) {
    return computeStaffSiblingLineItems(student, fees);
  }
  return computeStandardPayableLineItems(student, fees, inv);
}

/** Full fees with no exemption (used when exemption is removed). */
function computeFullTermLineItems(
  student: Student,
  fees: Record<string, unknown>,
  inv: Invoice
): {
  tuition: number;
  transport: number;
  dining: number;
  registration: number;
  desk: number;
} {
  const snap = {
    studentType: student.studentType,
    usesTransport: student.usesTransport === true,
    usesDiningHall: student.usesDiningHall === true,
    isStaffChild: false,
    isExempted: false
  };
  const logistics = computeLogisticsFees(snap, fees);
  const dayScholarTuition = parseAmount((fees as any).dayScholarTuitionFee);
  const boarderTuition = parseAmount((fees as any).boarderTuitionFee);
  const tuition =
    student.studentType === 'Boarder'
      ? parseFloat(boarderTuition.toFixed(2))
      : parseFloat(dayScholarTuition.toFixed(2));

  return {
    tuition: tuition > 0 ? tuition : 0,
    transport: logistics.transport,
    dining: logistics.diningHall,
    registration: parseAmount(inv.registrationAmount),
    desk: parseAmount(inv.deskFeeAmount)
  };
}

export function restoreFullFeesToInvoice(
  student: Student,
  inv: Invoice,
  fees: Record<string, unknown>
): void {
  const lines = computeFullTermLineItems(student, fees, inv);
  inv.tuitionAmount = lines.tuition;
  inv.transportAmount = lines.transport;
  inv.diningHallAmount = lines.dining;
  inv.registrationAmount = lines.registration;
  inv.deskFeeAmount = lines.desk;
  recomputeInvoiceTotalsFromLineItems(inv);
  appendDescription(inv, 'Exemption removed — invoice recalculated at standard rates');
}

/** Apply fixed or percentage exemption to the invoice balance, then align term fees. */
function applyBalanceExemption(student: Student, inv: Invoice): string | null {
  if (!student.isExempted || isStaffSiblingExemption(student)) {
    return null;
  }

  const previousBalance = parseAmount(inv.previousBalance);
  const paidAmount = parseAmount(inv.paidAmount);
  const prepaid = parseAmount(inv.prepaidAmount);
  const termFees = parseAmount(inv.amount);
  const totalOwed = parseFloat((previousBalance + termFees).toFixed(2));
  const appliedPrepaid = Math.min(prepaid, totalOwed);
  const originalBalance = parseAmount(inv.balance);

  let newBalance = originalBalance;
  let note: string | null = null;

  if (student.exemptionType === 'fixed') {
    const fixed = parseAmount(student.exemptionAmount);
    if (fixed <= 0) {
      return null;
    }
    newBalance = Math.max(0, parseFloat((originalBalance - fixed).toFixed(2)));
    note = `Exemption: fixed ${fixed.toFixed(2)} deducted from invoice balance`;
  } else if (student.exemptionType === 'percentage') {
    const pct = parseAmount(student.exemptionPercent);
    if (pct <= 0 || pct > 100) {
      return null;
    }
    const retainFactor = (100 - pct) / 100;
    newBalance = parseFloat((originalBalance * retainFactor).toFixed(2));
    note = `Exemption: ${pct}% off — balance is ${(retainFactor * 100).toFixed(0)}% of original (${newBalance.toFixed(2)})`;
  } else {
    return null;
  }

  inv.balance = newBalance;
  const newTotalOwed = parseFloat((newBalance + appliedPrepaid + paidAmount).toFixed(2));
  inv.amount = Math.max(0, parseFloat((newTotalOwed - previousBalance).toFixed(2)));
  inv.prepaidAmount = Math.max(0, parseFloat((prepaid - appliedPrepaid).toFixed(2)));
  updateInvoiceStatus(inv, paidAmount, newBalance);

  return note;
}

export function applyExemptionToInvoice(
  student: Student,
  inv: Invoice,
  fees: Record<string, unknown>
): void {
  const lines = computeBaseTermLineItems(student, fees, inv);

  inv.tuitionAmount = lines.tuition;
  inv.transportAmount = lines.transport;
  inv.diningHallAmount = lines.dining;
  inv.registrationAmount = lines.registration;
  inv.deskFeeAmount = lines.desk;

  recomputeInvoiceTotalsFromLineItems(inv);

  if (isStaffSiblingExemption(student)) {
    appendDescription(inv, 'Exemption: staff sibling — no tuition, registration, desk, or transport; 50% DH if applicable');
    return;
  }

  const balanceNote = applyBalanceExemption(student, inv);
  if (balanceNote) {
    appendDescription(inv, balanceNote);
  }
}

export type SyncExemptionInvoicesResult = {
  updated: number;
  message: string;
};

/** Recalculate open term-fee invoices for a student based on exemption type. */
export async function syncExemptionInvoicesForStudent(
  studentId: string,
  options?: { manager?: EntityManager }
): Promise<SyncExemptionInvoicesResult> {
  const em = options?.manager ?? AppDataSource.manager;
  const studentRepository = em.getRepository(Student);
  const invoiceRepository = em.getRepository(Invoice);
  const settingsRepository = em.getRepository(Settings);

  const student = await studentRepository.findOne({ where: { id: studentId } });
  if (!student) {
    throw new Error('Student not found');
  }

  const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
  const settings = settingsList.length > 0 ? settingsList[0] : null;
  if (!settings?.feesSettings) {
    throw new Error('Fee settings not configured. Configure fees in Settings first.');
  }

  const fees = settings.feesSettings as Record<string, unknown>;
  const hasExemption =
    isStaffSiblingExemption(student) ||
    (student.isExempted && (student.exemptionType === 'fixed' || student.exemptionType === 'percentage'));

  const openInvoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .where('invoice.studentId = :studentId', { studentId })
    .andWhere('invoice.isVoided = false')
    .andWhere('invoice.status IN (:...statuses)', { statuses: OPEN_STATUSES })
    .andWhere('COALESCE(invoice.uniformTotal, 0) = 0')
    .getMany();

  if (openInvoices.length === 0) {
    return { updated: 0, message: 'No open invoices to sync' };
  }

  let updated = 0;
  for (const inv of openInvoices) {
    if (hasExemption) {
      applyExemptionToInvoice(student, inv, fees);
    } else {
      restoreFullFeesToInvoice(student, inv, fees);
    }
    await invoiceRepository.save(inv);
    updated += 1;
  }

  const action = hasExemption ? 'Applied exemption to' : 'Restored standard fees on';
  return {
    updated,
    message: `${action} ${updated} open invoice(s) for ${student.firstName} ${student.lastName}`
  };
}
