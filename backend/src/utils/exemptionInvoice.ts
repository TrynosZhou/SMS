import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { computeLogisticsFees, recomputeInvoiceTotalsFromLineItems, snapshotFromStudent } from './studentLogisticsInvoice';
import { isNewStudentStatus, studentHasClassAssignment } from './studentEnrollmentStatus';

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

function exemptionTypeKey(student: Student | null | undefined): string {
  return String(student?.exemptionType || '').trim().toLowerCase();
}

function studentFixedExemptionAmount(student: Student): number {
  return parseAmount(student.exemptionAmount);
}

function studentPercentageExemption(student: Student): number {
  return parseAmount(student.exemptionPercent);
}

/**
 * True when fee logic should treat the student as exempt (matches sync-exemption-invoices).
 * Does not treat orphan `exemptionType` alone as exempt — requires staff flag/type or isExempted + fixed/percentage.
 */
export function studentHasActiveFeeExemption(student: Student): boolean {
  return isStaffSiblingExemption(student) || isBalanceOnlyExemption(student);
}

/** Fixed amount or percentage of tuition: keep standard fee lines, then deduct from invoice total/balance. */
export function isBalanceOnlyExemption(student: Student): boolean {
  if (!student || student.isExempted !== true || isStaffSiblingExemption(student)) {
    return false;
  }
  const type = exemptionTypeKey(student);
  if (type === 'fixed' || type === 'percentage') return true;
  return studentFixedExemptionAmount(student) > 0.005 || studentPercentageExemption(student) > 0.005;
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
  const isNew =
    isNewStudentStatus((student as any).studentStatus) &&
    !studentHasClassAssignment(student);

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
  inv.description = stripExemptionNotes(String(inv.description || ''));
  const lines = computeFullTermLineItems(student, fees, inv);
  inv.tuitionAmount = lines.tuition;
  inv.transportAmount = lines.transport;
  inv.diningHallAmount = lines.dining;
  inv.registrationAmount = lines.registration;
  inv.deskFeeAmount = lines.desk;
  recomputeInvoiceTotalsFromLineItems(inv);
  appendDescription(inv, 'Exemption removed — invoice recalculated at standard rates');
}

/** Deduct an exemption discount from term fee line items — tuition first, then other fees. Returns leftover. */
function applyDiscountToTermLineItems(inv: Invoice, discount: number): number {
  let remaining = Math.max(0, parseFloat(parseAmount(discount).toFixed(2)));
  if (remaining <= 0.005) return 0;

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
  return remaining;
}

function stripExemptionNotes(description: string): string {
  return String(description || '')
    .replace(/\s*\|\s*Exemption:[^|]*/gi, '')
    .replace(/Exemption:[^|]*/gi, '')
    .replace(/\s+\|\s+/g, ' | ')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
}

function zeroTermFeeLineItems(inv: Invoice): void {
  inv.tuitionAmount = 0;
  inv.transportAmount = 0;
  inv.diningHallAmount = 0;
  inv.registrationAmount = 0;
  inv.deskFeeAmount = 0;
}

/**
 * Apply fixed / percentage / other numeric exemptions.
 * Fixed amount: reduce invoice total and balance by that amount.
 * Percentage: deduct (percent × tuition) from the invoice total (other fees unchanged).
 */
function applyBalanceExemption(student: Student, inv: Invoice): string | null {
  if (isStaffSiblingExemption(student)) {
    return null;
  }
  if (!isBalanceOnlyExemption(student)) {
    return null;
  }

  const type = exemptionTypeKey(student);
  const tuition = parseAmount(inv.tuitionAmount);
  const pct = studentPercentageExemption(student);
  const fixed = studentFixedExemptionAmount(student);
  const usePercentage =
    type === 'percentage' || (type !== 'fixed' && pct > 0.005 && fixed <= 0.005);

  if (usePercentage) {
    if (pct <= 0 || pct > 100) {
      return null;
    }
    if (pct >= 100) {
      zeroTermFeeLineItems(inv);
      recomputeInvoiceTotalsFromLineItems(inv);
      return 'Exemption: 100% — all term fees waived';
    }
    const discount = parseFloat((tuition * (pct / 100)).toFixed(2));
    inv.tuitionAmount = parseFloat(Math.max(0, tuition - discount).toFixed(2));
    recomputeInvoiceTotalsFromLineItems(inv);
    return `Exemption: ${pct}% of tuition (${discount.toFixed(2)}) deducted from invoice total`;
  }

  const amount = type === 'fixed' || fixed > 0.005 ? fixed : 0;
  if (amount <= 0.005) {
    return null;
  }

  const leftover = applyDiscountToTermLineItems(inv, amount);
  if (leftover > 0.005) {
    inv.previousBalance = Math.max(
      0,
      parseFloat((parseAmount(inv.previousBalance) - leftover).toFixed(2))
    );
  }
  recomputeInvoiceTotalsFromLineItems(inv);
  return `Exemption: fixed ${amount.toFixed(2)} deducted from invoice balance`;
}

export function applyExemptionToInvoice(
  student: Student,
  inv: Invoice,
  fees: Record<string, unknown>,
  options?: { includeDeskFee?: boolean }
): void {
  inv.description = stripExemptionNotes(String(inv.description || ''));

  const lines = computeBaseTermLineItems(student, fees, inv);
  const includeDeskFee = options?.includeDeskFee !== false;

  inv.tuitionAmount = lines.tuition;
  inv.transportAmount = lines.transport;
  inv.diningHallAmount = lines.dining;
  inv.registrationAmount = lines.registration;
  // Desk fee is charged once on admission — bulk term invoices must not add it.
  inv.deskFeeAmount = includeDeskFee ? lines.desk : 0;

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
