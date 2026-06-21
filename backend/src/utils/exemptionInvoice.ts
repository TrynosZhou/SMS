import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { computeLogisticsFees, recomputeInvoiceTotalsFromLineItems, snapshotFromStudent } from './studentLogisticsInvoice';

export function isStaffSiblingExemption(student: Student): boolean {
  return student.isStaffChild === true || student.exemptionType === 'staff_sibling';
}

/** 100% percentage fee exemption — no term-fee invoice should be created. */
export function isFullPercentageExemption(student: Student | null | undefined): boolean {
  if (!student || student.isExempted !== true) return false;
  return (
    String(student.exemptionType || '').trim().toLowerCase() === 'percentage' &&
    parseAmount(student.exemptionPercent) >= 100
  );
}

export function shouldSkipTermFeeInvoiceCreation(student: Student | null | undefined): boolean {
  return isFullPercentageExemption(student);
}

/**
 * True when fee logic should treat the student as exempt (matches sync-exemption-invoices).
 * Does not treat orphan `exemptionType` alone as exempt — requires staff flag/type or isExempted + fixed/percentage.
 */
export function studentHasActiveFeeExemption(student: Student): boolean {
  return (
    isStaffSiblingExemption(student) ||
    (student.isExempted === true &&
      (student.exemptionType === 'fixed' || student.exemptionType === 'percentage'))
  );
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

/** Deduct an exemption discount from term fee line items — tuition first, then other fees. */
function applyDiscountToTermLineItems(inv: Invoice, discount: number): void {
  let remaining = Math.max(0, parseFloat(parseAmount(discount).toFixed(2)));
  if (remaining <= 0.005) return;

  const buckets: Array<{ key: keyof Invoice; value: number }> = [
    { key: 'tuitionAmount', value: parseAmount(inv.tuitionAmount) },
    { key: 'diningHallAmount', value: parseAmount(inv.diningHallAmount) },
    { key: 'transportAmount', value: parseAmount(inv.transportAmount) },
    { key: 'registrationAmount', value: parseAmount(inv.registrationAmount) },
    { key: 'deskFeeAmount', value: parseAmount(inv.deskFeeAmount) },
  ];

  for (const bucket of buckets) {
    if (remaining <= 0.005) break;
    const cut = Math.min(bucket.value, remaining);
    (inv as any)[bucket.key] = parseFloat((bucket.value - cut).toFixed(2));
    remaining = parseFloat((remaining - cut).toFixed(2));
  }
}

function zeroTermFeeLineItems(inv: Invoice): void {
  inv.tuitionAmount = 0;
  inv.transportAmount = 0;
  inv.diningHallAmount = 0;
  inv.registrationAmount = 0;
  inv.deskFeeAmount = 0;
}

/** Apply fixed or percentage exemption to term fee line items (tuition first), then recompute balance. */
function applyBalanceExemption(student: Student, inv: Invoice): string | null {
  if (!student.isExempted || isStaffSiblingExemption(student)) {
    return null;
  }

  const tuition = parseAmount(inv.tuitionAmount);
  const transport = parseAmount(inv.transportAmount);
  const dining = parseAmount(inv.diningHallAmount);
  const registration = parseAmount(inv.registrationAmount);
  const desk = parseAmount(inv.deskFeeAmount);
  const termFeesTotal = parseFloat((tuition + transport + dining + registration + desk).toFixed(2));

  if (student.exemptionType === 'fixed') {
    const fixed = parseAmount(student.exemptionAmount);
    if (fixed <= 0) {
      return null;
    }
    applyDiscountToTermLineItems(inv, fixed);
    recomputeInvoiceTotalsFromLineItems(inv);
    return `Exemption: fixed ${fixed.toFixed(2)} deducted from tuition/fees`;
  }

  if (student.exemptionType === 'percentage') {
    const pct = parseAmount(student.exemptionPercent);
    if (pct <= 0 || pct > 100) {
      return null;
    }
    if (pct >= 100) {
      zeroTermFeeLineItems(inv);
      recomputeInvoiceTotalsFromLineItems(inv);
      return 'Exemption: 100% — all term fees waived';
    }
    const discount = parseFloat((termFeesTotal * (pct / 100)).toFixed(2));
    applyDiscountToTermLineItems(inv, discount);
    recomputeInvoiceTotalsFromLineItems(inv);
    return `Exemption: ${pct}% off term fees (${discount.toFixed(2)} waived)`;
  }

  return null;
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
  const hasExemption = studentHasActiveFeeExemption(student);

  const termInvoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .where('invoice.studentId = :studentId', { studentId })
    .andWhere('invoice.isVoided = false')
    .andWhere('COALESCE(invoice.uniformTotal, 0) = 0')
    .orderBy('invoice.createdAt', 'ASC')
    .getMany();

  if (termInvoices.length === 0) {
    return { updated: 0, message: 'No term-fee invoices to sync' };
  }

  let updated = 0;
  for (const inv of termInvoices) {
    if (isFullPercentageExemption(student) && parseAmount(inv.paidAmount) <= 0.005) {
      inv.isVoided = true;
      inv.status = InvoiceStatus.VOID;
      inv.voidReason = '100% fee exemption — term invoice not required';
      inv.balance = 0;
      inv.amount = 0;
      zeroTermFeeLineItems(inv);
      appendDescription(inv, 'Voided: 100% fee exemption');
      await invoiceRepository.save(inv);
      updated += 1;
      continue;
    }

    if (isFullPercentageExemption(student)) {
      zeroTermFeeLineItems(inv);
      inv.amount = 0;
      inv.balance = Math.max(0, parseAmount(inv.previousBalance) - parseAmount(inv.paidAmount));
      recomputeInvoiceTotalsFromLineItems(inv);
      inv.status = InvoiceStatus.PAID;
      appendDescription(inv, 'Exemption: 100% — all term fees waived');
      await invoiceRepository.save(inv);
      updated += 1;
      continue;
    }

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
    message: `${action} ${updated} term-fee invoice(s) for ${student.firstName} ${student.lastName}`
  };
}
