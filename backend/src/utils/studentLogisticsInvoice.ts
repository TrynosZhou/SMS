import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { parseAmount } from './numberUtils';
import { canonicalInvoiceTermFees, effectiveTermFeesForBalance } from './invoiceTermFees';

export type StudentLogisticsSnapshot = {
  studentType: string;
  usesTransport: boolean;
  usesDiningHall: boolean;
  isStaffChild: boolean;
  isExempted: boolean;
};

export function snapshotFromStudent(student: Partial<Student> | StudentLogisticsSnapshot): StudentLogisticsSnapshot {
  return {
    studentType: String(student.studentType || 'Day Scholar'),
    usesTransport: student.usesTransport === true,
    usesDiningHall: student.usesDiningHall === true,
    isStaffChild: student.isStaffChild === true,
    isExempted: student.isExempted === true
  };
}

export function logisticsProfileChanged(
  before: StudentLogisticsSnapshot,
  after: StudentLogisticsSnapshot
): boolean {
  return (
    before.studentType !== after.studentType ||
    before.usesTransport !== after.usesTransport ||
    before.usesDiningHall !== after.usesDiningHall ||
    before.isStaffChild !== after.isStaffChild
  );
}

/** Transport and dining-hall fee amounts from settings for a student profile. */
export function computeLogisticsFees(
  snap: StudentLogisticsSnapshot,
  fees: Record<string, unknown> | null | undefined
): { transport: number; diningHall: number } {
  const transportCost = parseAmount((fees as any)?.transportCost ?? (fees as any)?.transportFee);
  const diningHallCost = parseAmount((fees as any)?.diningHallCost ?? (fees as any)?.diningHallFee);
  const isDayScholar = String(snap.studentType || '').trim().toLowerCase() === 'day scholar';
  const isStaffSibling = snap.isStaffChild;
  const noTransport = isStaffSibling;

  let transport = 0;
  let diningHall = 0;

  if (isDayScholar && snap.usesTransport && !noTransport && transportCost > 0) {
    transport = parseFloat(transportCost.toFixed(2));
  }
  if (isDayScholar && snap.usesDiningHall && diningHallCost > 0) {
    const raw = isStaffSibling ? diningHallCost * 0.5 : diningHallCost;
    diningHall = parseFloat(raw.toFixed(2));
  }

  return { transport, diningHall };
}

/**
 * When invoice line items do not sum to `amount`, assign the remainder to tuition
 * so transport/DH edits only change the logistics portion (referential integrity).
 */
export function ensureInvoiceLineItemsCoherent(
  inv: Invoice,
  logistics: { transport: number; diningHall: number }
): void {
  const amount = parseAmount(inv.amount);
  if (amount <= 0.005) return;

  const transport = parseAmount(logistics.transport);
  const dining = parseAmount(logistics.diningHall);
  const registration = parseAmount(inv.registrationAmount);
  const desk = parseAmount(inv.deskFeeAmount);
  const tuition = parseAmount(inv.tuitionAmount);
  const sum = parseFloat((tuition + transport + dining + registration + desk).toFixed(2));

  if (sum > 0.005 && Math.abs(sum - amount) <= 0.05) return;

  const tuitionRemainder = parseFloat((amount - transport - dining - registration - desk).toFixed(2));
  if (tuitionRemainder >= 0) {
    inv.tuitionAmount = tuitionRemainder;
  }
}

/** Recompute invoice.amount (term fees) and balance from canonical line items. */
export function recomputeInvoiceTotalsFromLineItems(
  inv: Invoice,
  options?: { trustCanonicalLines?: boolean }
): void {
  const previousBalance = parseAmount(inv.previousBalance);
  const paidAmount = parseAmount(inv.paidAmount);
  const prepaid = parseAmount(inv.prepaidAmount);
  const termFees = options?.trustCanonicalLines
    ? canonicalInvoiceTermFees(inv)
    : effectiveTermFeesForBalance(inv);
  inv.amount = termFees;

  const totalOwed = parseFloat((previousBalance + termFees).toFixed(2));
  const appliedPrepaid = Math.min(prepaid, totalOwed);
  const remainingPrepaid = Math.max(0, parseFloat((prepaid - appliedPrepaid).toFixed(2)));
  const newBalance = Math.max(0, parseFloat((totalOwed - appliedPrepaid - paidAmount).toFixed(2)));

  inv.balance = newBalance;
  inv.prepaidAmount = remainingPrepaid;

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

function appendDescription(inv: Invoice, note: string): void {
  const trimmed = String(note || '').trim();
  if (!trimmed) return;
  const existing = String(inv.description || '').trim();
  inv.description = existing ? `${existing} | ${trimmed}` : trimmed;
}

const OPEN_STATUSES = [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL];

export type LogisticsInvoiceSyncResult = {
  updatedInvoices: number;
  adjustments: string[];
  deltaTransport: number;
  deltaDiningHall: number;
  deltaTuition?: number;
};

/** Tuition from settings for Day Scholar vs Boarder (staff children pay no tuition). */
export function computeTuitionFee(
  snap: StudentLogisticsSnapshot,
  fees: Record<string, unknown> | null | undefined
): number {
  if (snap.isStaffChild) return 0;
  const legacy = parseAmount((fees as any)?.tuitionFee ?? (fees as any)?.tuition);
  const dayScholar = parseAmount((fees as any)?.dayScholarTuitionFee) || legacy;
  const boarder = parseAmount((fees as any)?.boarderTuitionFee) || legacy;
  const isBoarder = String(snap.studentType || '').trim().toLowerCase() === 'boarder';
  const raw = isBoarder ? boarder : dayScholar;
  return raw > 0 ? parseFloat(raw.toFixed(2)) : 0;
}

function resolvePriorLogisticsOnInvoice(
  inv: Invoice,
  profileFees: { transport: number; diningHall: number }
): { transport: number; diningHall: number } {
  let transport = parseAmount(inv.transportAmount);
  let dining = parseAmount(inv.diningHallAmount);

  // Invoice columns may be empty while the student profile had logistics enabled
  if (transport < 0.005 && profileFees.transport > 0) {
    transport = profileFees.transport;
  }
  if (dining < 0.005 && profileFees.diningHall > 0) {
    dining = profileFees.diningHall;
  }

  return { transport, diningHall: dining };
}

/**
 * Apply settings-based tuition (on type change), transport, and DH to one invoice.
 */
export function applyLogisticsFeesToInvoice(
  inv: Invoice,
  beforeProfileFees: { transport: number; diningHall: number },
  afterFees: { transport: number; diningHall: number },
  options?: {
    beforeSnap?: StudentLogisticsSnapshot;
    afterSnap?: StudentLogisticsSnapshot;
    fees?: Record<string, unknown> | null | undefined;
  }
): string[] {
  const prior = resolvePriorLogisticsOnInvoice(inv, beforeProfileFees);
  ensureInvoiceLineItemsCoherent(inv, prior);

  const prevTransport = prior.transport;
  const prevDining = prior.diningHall;
  const prevTuition = parseAmount(inv.tuitionAmount);

  const typeChanged =
    options?.beforeSnap &&
    options?.afterSnap &&
    options.beforeSnap.studentType !== options.afterSnap.studentType;

  if (typeChanged && options.afterSnap && options.fees) {
    inv.tuitionAmount = computeTuitionFee(options.afterSnap, options.fees);
  }

  inv.transportAmount = afterFees.transport;
  inv.diningHallAmount = afterFees.diningHall;
  recomputeInvoiceTotalsFromLineItems(inv, { trustCanonicalLines: true });

  const parts: string[] = [];
  if (typeChanged && options?.afterSnap) {
    const newTuition = parseAmount(inv.tuitionAmount);
    if (Math.abs(newTuition - prevTuition) >= 0.005) {
      parts.push(
        `Tuition adjusted for ${options.afterSnap.studentType} (${Math.abs(newTuition - prevTuition).toFixed(2)})`
      );
    }
  }
  if (Math.abs(afterFees.transport - prevTransport) >= 0.005) {
    const dir = afterFees.transport > prevTransport ? 'added' : 'removed';
    parts.push(`Transport ${dir} (${Math.abs(afterFees.transport - prevTransport).toFixed(2)})`);
  }
  if (Math.abs(afterFees.diningHall - prevDining) >= 0.005) {
    const dir = afterFees.diningHall > prevDining ? 'added' : 'removed';
    parts.push(`Dining Hall ${dir} (${Math.abs(afterFees.diningHall - prevDining).toFixed(2)})`);
  }

  return parts;
}

function pickLogisticsInvoiceTargets(
  invoices: Invoice[],
  activeTerm?: string | null
): Invoice[] {
  const nonVoid = invoices.filter((inv) => !inv.isVoided);
  const termFeeInvoices = nonVoid.filter((inv) => parseAmount(inv.uniformTotal) <= 0.005);

  const pool = termFeeInvoices.length > 0 ? termFeeInvoices : nonVoid;
  const open = pool.filter((inv) => OPEN_STATUSES.includes(inv.status));

  if (activeTerm) {
    const termOpen = open.filter((inv) => String(inv.term || '').trim() === String(activeTerm).trim());
    if (termOpen.length > 0) return termOpen;
  }

  if (open.length > 0) return open;

  if (pool.length > 0) return [pool[0]];
  if (nonVoid.length > 0) return [nonVoid[0]];

  return [];
}

/**
 * When transport / dining-hall / student type changes, align open invoice line items
 * and balances with settings (amounts from System Settings).
 */
export async function syncStudentLogisticsInvoices(options: {
  studentId: string;
  before: StudentLogisticsSnapshot;
  after: StudentLogisticsSnapshot;
  fees: Record<string, unknown> | null | undefined;
  activeTerm?: string | null;
  manager?: EntityManager;
}): Promise<LogisticsInvoiceSyncResult> {
  const em = options.manager ?? AppDataSource.manager;
  const invoiceRepo = em.getRepository(Invoice);

  const beforeFees = computeLogisticsFees(options.before, options.fees);
  const afterFees = computeLogisticsFees(options.after, options.fees);
  const beforeTuition = computeTuitionFee(options.before, options.fees);
  const afterTuition = computeTuitionFee(options.after, options.fees);
  const deltaTransport = parseFloat((afterFees.transport - beforeFees.transport).toFixed(2));
  const deltaDiningHall = parseFloat((afterFees.diningHall - beforeFees.diningHall).toFixed(2));
  const deltaTuition = parseFloat((afterTuition - beforeTuition).toFixed(2));
  const typeChanged = options.before.studentType !== options.after.studentType;

  if (
    Math.abs(deltaTransport) < 0.005 &&
    Math.abs(deltaDiningHall) < 0.005 &&
    Math.abs(deltaTuition) < 0.005 &&
    !typeChanged
  ) {
    return { updatedInvoices: 0, adjustments: [], deltaTransport: 0, deltaDiningHall: 0, deltaTuition: 0 };
  }

  const invoices = await invoiceRepo
    .createQueryBuilder('invoice')
    .where('invoice.studentId = :studentId', { studentId: options.studentId })
    .andWhere('invoice.isVoided = false')
    .orderBy('invoice.createdAt', 'DESC')
    .getMany();

  const targets = pickLogisticsInvoiceTargets(invoices, options.activeTerm);
  if (targets.length === 0) {
    throw new Error(
      'No invoice found for this student. Create a term invoice before changing transport, dining hall, or student type.'
    );
  }

  const adjustments: string[] = [];
  let updatedInvoices = 0;

  for (const inv of targets) {
    const parts = applyLogisticsFeesToInvoice(inv, beforeFees, afterFees, {
      beforeSnap: options.before,
      afterSnap: options.after,
      fees: options.fees
    });
    if (parts.length > 0) {
      appendDescription(inv, `Student profile update: ${parts.join('; ')}`);
      adjustments.push(...parts);
    }

    await invoiceRepo.save(inv);
    updatedInvoices += 1;
  }

  return { updatedInvoices, adjustments, deltaTransport, deltaDiningHall, deltaTuition };
}

/**
 * Fix invoices where transport/DH line items were saved but amount/balance were capped
 * at the pre-logistics total (legacy effectiveTermFees guard).
 */
export async function repairStaleLogisticsInvoiceBalances(
  studentId: string,
  manager?: EntityManager
): Promise<number> {
  const em = manager ?? AppDataSource.manager;
  const invoiceRepo = em.getRepository(Invoice);
  const invoices = await invoiceRepo.find({
    where: { studentId, isVoided: false },
    order: { createdAt: 'DESC' }
  });

  let repaired = 0;
  for (const inv of invoices) {
    const canonical = canonicalInvoiceTermFees(inv);
    const amountCol = parseAmount(inv.amount);
    const balanceCol = parseAmount(inv.balance);
    const logistics = parseAmount(inv.transportAmount) + parseAmount(inv.diningHallAmount);
    if (logistics <= 0.005 || canonical <= amountCol + 0.05) continue;

    const nonLogistics = canonical - logistics;
    if (nonLogistics > amountCol + 0.05) continue;

    recomputeInvoiceTotalsFromLineItems(inv, { trustCanonicalLines: true });
    if (
      Math.abs(parseAmount(inv.amount) - amountCol) > 0.005 ||
      Math.abs(parseAmount(inv.balance) - balanceCol) > 0.005
    ) {
      await invoiceRepo.save(inv);
      repaired += 1;
    }
  }
  return repaired;
}
