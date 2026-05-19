import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { parseAmount } from './numberUtils';

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
  if (snap.usesDiningHall && diningHallCost > 0) {
    const raw = isStaffSibling ? diningHallCost * 0.5 : diningHallCost;
    diningHall = parseFloat(raw.toFixed(2));
  }

  return { transport, diningHall };
}

/** Recompute invoice.amount (term fees) and balance from canonical line items. */
export function recomputeInvoiceTotalsFromLineItems(inv: Invoice): void {
  const previousBalance = parseAmount(inv.previousBalance);
  const paidAmount = parseAmount(inv.paidAmount);
  const prepaid = parseAmount(inv.prepaidAmount);
  const tuition = parseAmount(inv.tuitionAmount);
  const transport = parseAmount(inv.transportAmount);
  const dining = parseAmount(inv.diningHallAmount);
  const registration = parseAmount(inv.registrationAmount);
  const desk = parseAmount(inv.deskFeeAmount);

  const termFees = parseFloat((tuition + transport + dining + registration + desk).toFixed(2));
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
};

/**
 * When transport / dining-hall flags change on a student, align open invoice line items
 * and balances with settings (add on tick, subtract on untick).
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
  const deltaTransport = parseFloat((afterFees.transport - beforeFees.transport).toFixed(2));
  const deltaDiningHall = parseFloat((afterFees.diningHall - beforeFees.diningHall).toFixed(2));

  if (Math.abs(deltaTransport) < 0.005 && Math.abs(deltaDiningHall) < 0.005) {
    return { updatedInvoices: 0, adjustments: [], deltaTransport: 0, deltaDiningHall: 0 };
  }

  const qb = invoiceRepo
    .createQueryBuilder('invoice')
    .where('invoice.studentId = :studentId', { studentId: options.studentId })
    .andWhere('invoice.isVoided = false')
    .orderBy('invoice.createdAt', 'DESC');

  if (options.activeTerm) {
    qb.andWhere('invoice.term = :term', { term: options.activeTerm });
  }

  let invoices = await qb.getMany();

  // If active term filter found nothing, fall back to all non-void invoices for the student
  if (invoices.length === 0 && options.activeTerm) {
    invoices = await invoiceRepo
      .createQueryBuilder('invoice')
      .where('invoice.studentId = :studentId', { studentId: options.studentId })
      .andWhere('invoice.isVoided = false')
      .orderBy('invoice.createdAt', 'DESC')
      .getMany();
  }

  let targets = invoices.filter((inv) => OPEN_STATUSES.includes(inv.status));

  // If no open invoice but logistics increased, apply to the latest non-void invoice
  if (targets.length === 0 && invoices.length > 0 && (deltaTransport > 0 || deltaDiningHall > 0)) {
    targets = [invoices[0]];
  }

  const adjustments: string[] = [];
  let updatedInvoices = 0;

  for (const inv of targets) {
    const prevTransport = parseAmount(inv.transportAmount);
    const prevDining = parseAmount(inv.diningHallAmount);

    inv.transportAmount = afterFees.transport;
    inv.diningHallAmount = afterFees.diningHall;
    recomputeInvoiceTotalsFromLineItems(inv);

    const parts: string[] = [];
    if (Math.abs(afterFees.transport - prevTransport) >= 0.005) {
      const dir = afterFees.transport > prevTransport ? 'added' : 'removed';
      parts.push(`Transport ${dir} (${Math.abs(afterFees.transport - prevTransport).toFixed(2)})`);
    }
    if (Math.abs(afterFees.diningHall - prevDining) >= 0.005) {
      const dir = afterFees.diningHall > prevDining ? 'added' : 'removed';
      parts.push(`Dining Hall ${dir} (${Math.abs(afterFees.diningHall - prevDining).toFixed(2)})`);
    }
    if (parts.length > 0) {
      appendDescription(inv, `Student profile update: ${parts.join('; ')}`);
      adjustments.push(...parts);
    }

    await invoiceRepo.save(inv);
    updatedInvoices += 1;
  }

  return { updatedInvoices, adjustments, deltaTransport, deltaDiningHall };
}
