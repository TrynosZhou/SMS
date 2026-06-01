import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { recomputeInvoiceTotalsFromLineItems } from './studentLogisticsInvoice';
import {
  outstandingExcludingTransportBucket,
  remainingBucketsAfterAppliedTotals,
  snapshotFromInvoiceAndStudent
} from './transportDhWaterfall';
/**
 * Desk fee from settings (same shape as finance / outstanding-balance).
 */
export function getConfiguredDeskFee(settings: Settings | null | undefined): number {
  if (!settings || !(settings as any).feesSettings) return 0;
  return Number((settings as any).feesSettings.deskFee || 0);
}

export type LogisticsFeesForOutstanding = {
  transportCost: number;
  diningHallCost: number;
};

const tryNum = (v: unknown): number => (isFinite(Number(v)) ? Number(v) : 0);

/**
 * Older bulk invoices often have `amount` set but fee line columns empty.
 * Balance and notes use line items — seed tuition from amount when needed.
 */
export function hydrateInvoiceLineItemsFromAmount(invoice: Invoice | null | undefined): boolean {
  if (!invoice || invoice.isVoided) return false;
  const termFees = canonicalInvoiceTermFees(invoice);
  const amountCol = tryNum(invoice.amount);
  if (termFees > 0.005 || amountCol <= 0.005) return false;

  invoice.tuitionAmount = parseFloat(amountCol.toFixed(2));
  invoice.amount = invoice.tuitionAmount;
  return true;
}

/** Term fee lines on the invoice (tuition, transport, DH, registration, desk). */
export function canonicalInvoiceTermFees(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const tuition = tryNum(invoice.tuitionAmount);
  const transport = tryNum(invoice.transportAmount);
  const dining = tryNum(invoice.diningHallAmount);
  const registration = tryNum(invoice.registrationAmount);
  const desk = tryNum(invoice.deskFeeAmount);
  return parseFloat((tuition + transport + dining + registration + desk).toFixed(2));
}

/**
 * Canonical outstanding balance — same formula as recomputeInvoiceTotalsFromLineItems,
 * receipts, and the credit/debit note invoice summary:
 *   (previousBalance + termFees) − appliedPrepaid − paidAmount
 */
function effectiveTermFeesForBalance(invoice: Invoice): number {
  const fromLines = canonicalInvoiceTermFees(invoice);
  if (fromLines > 0.005) return fromLines;
  return tryNum(invoice.amount);
}

export function computeCanonicalInvoiceBalance(invoice: Invoice | null | undefined): number {
  if (!invoice || invoice.isVoided) return 0;

  const termFees = effectiveTermFeesForBalance(invoice);
  const previousBalance = tryNum(invoice.previousBalance);
  const paidAmount = tryNum(invoice.paidAmount);
  const prepaidRemaining = tryNum(invoice.prepaidAmount);

  const totalOwed = parseFloat((previousBalance + termFees).toFixed(2));
  const balanceCol = tryNum(invoice.balance);

  // Same formula as recomputeInvoiceTotalsFromLineItems (prepaid pool applied up to totalOwed)
  const appliedPrepaid = Math.min(prepaidRemaining, totalOwed);
  const fromLineItems = Math.max(
    0,
    parseFloat((totalOwed - appliedPrepaid - paidAmount).toFixed(2))
  );

  if (termFees <= 0.005 && previousBalance <= 0.005) {
    return Math.max(0, balanceCol);
  }

  // Stale low balance column: trust line items. After debit notes, column can be ahead of pool math.
  if (balanceCol > fromLineItems + 0.02) {
    return parseFloat(balanceCol.toFixed(2));
  }

  return fromLineItems;
}

function isFullPercentageExemption(student: Student | null | undefined): boolean {
  return (
    !!student &&
    (student as any).isExempted === true &&
    String((student as any).exemptionType || '').trim().toLowerCase() === 'percentage' &&
    tryNum((student as any).exemptionPercent) >= 100
  );
}

/**
 * Outstanding tuition/fees for one invoice.
 * When `logisticsFees` is set (parent portal), transport bucket may be excluded via waterfall.
 */
export function computeInvoiceFeesOutstanding(
  invoice: Invoice | null | undefined,
  student: Student | null | undefined,
  _configuredDeskFee: number,
  logisticsFees?: LogisticsFeesForOutstanding | null
): number {
  if (!invoice || invoice.isVoided) return 0;

  if (isFullPercentageExemption(student)) {
    return parseFloat(Math.max(0, tryNum(invoice.balance)).toFixed(2));
  }

  const base = computeCanonicalInvoiceBalance(invoice);

  if (!logisticsFees || !student) {
    return base;
  }

  const tr = tryNum(logisticsFees.transportCost);
  const dh = tryNum(logisticsFees.diningHallCost);
  const snap = snapshotFromInvoiceAndStudent(invoice, student);
  snap.previousBalance = tryNum(invoice.previousBalance);
  const remaining = remainingBucketsAfterAppliedTotals(snap, tr, dh);
  return Math.max(0, outstandingExcludingTransportBucket(remaining));
}

/**
 * Amount owed on one invoice for balance enquiry, outstanding-fees, record payment, etc.
 * Uses (previousBalance + term line items) − paid − prepaid — same as receipts and credit notes.
 * The persisted balance column can be stale when amount ≠ sum(line items) after adjustments.
 */
export function computeInvoiceOwedAmount(
  invoice: Invoice | null | undefined,
  student: Student | null | undefined,
  _configuredDeskFee: number
): number {
  if (!invoice || invoice.isVoided) return 0;

  if (isFullPercentageExemption(student)) {
    const canonical = computeCanonicalInvoiceBalance(invoice);
    const fromColumn = tryNum(invoice.balance);
    if (fromColumn <= 0.005) {
      return parseFloat(Math.max(0, canonical).toFixed(2));
    }
    return parseFloat(Math.max(0, Math.min(fromColumn, canonical)).toFixed(2));
  }

  return parseFloat(Math.max(0, computeCanonicalInvoiceBalance(invoice)).toFixed(2));
}

/**
 * Invoice row to check for report-card access: same term as the report card when provided;
 * otherwise latest non-voided invoice (legacy paths).
 */
export async function findInvoiceForReportCardAccess(
  invoiceRepo: Repository<Invoice>,
  studentId: string,
  reportCardTerm: string | null | undefined
): Promise<Invoice | null> {
  const term = reportCardTerm ? String(reportCardTerm).trim() : '';
  if (term) {
    return invoiceRepo.findOne({
      where: { studentId, term, isVoided: false },
      order: { createdAt: 'DESC' }
    });
  }
  return invoiceRepo.findOne({
    where: { studentId, isVoided: false },
    order: { createdAt: 'DESC' }
  });
}

export type StudentOutstandingInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  term: string | null;
  owed: number;
  previousBalance: number;
  termFees: number;
  paidAmount: number;
  status: string;
  createdAt: Date;
  /** True when this row is the prior-term balance rolled into a newer invoice. */
  includesPriorTermBalance: boolean;
};

/**
 * Non-void invoices with money still owed, oldest first.
 * Skips older invoices whose balance was carried forward on a newer invoice (previousBalance).
 */
export function listStudentOutstandingInvoices(
  invoices: Invoice[],
  student: Student | null | undefined,
  configuredDeskFee: number
): StudentOutstandingInvoiceRow[] {
  const nonVoid = invoices
    .filter((inv) => !inv.isVoided)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const working = nonVoid.map((inv) => ({
    inv,
    owed: computeInvoiceOwedAmount(inv, student ?? null, configuredDeskFee)
  }));

  for (let i = 0; i < working.length; i++) {
    if (working[i].owed <= 0.005) continue;
    for (let j = i + 1; j < working.length; j++) {
      if (tryNum(working[j].inv.previousBalance) > 0.005) {
        working[i].owed = 0;
        break;
      }
    }
  }

  return working
    .filter((row) => row.owed > 0.005)
    .map((row) => {
      const prevBal = tryNum(row.inv.previousBalance);
      const termFees = canonicalInvoiceTermFees(row.inv);
      return {
        invoiceId: row.inv.id,
        invoiceNumber: row.inv.invoiceNumber,
        term: row.inv.term ? String(row.inv.term) : null,
        owed: parseFloat(row.owed.toFixed(2)),
        previousBalance: prevBal,
        termFees,
        paidAmount: tryNum(row.inv.paidAmount),
        status: String(row.inv.status || ''),
        createdAt: row.inv.createdAt,
        includesPriorTermBalance: prevBal > 0.005
      };
    });
}

/** Total tuition/fees owed across all terms (no double-count when balance was carried forward). */
export function computeStudentTotalOutstanding(
  invoices: Invoice[],
  student: Student | null | undefined,
  configuredDeskFee: number
): number {
  const rows = listStudentOutstandingInvoices(invoices, student, configuredDeskFee);
  return parseFloat(rows.reduce((sum, row) => sum + row.owed, 0).toFixed(2));
}

/** Oldest invoice with outstanding balance — use for payment allocation (FIFO). */
export function pickPaymentTargetInvoiceId(
  invoices: Invoice[],
  student: Student | null | undefined,
  configuredDeskFee: number
): string | null {
  const rows = listStudentOutstandingInvoices(invoices, student, configuredDeskFee);
  return rows.length > 0 ? rows[0].invoiceId : null;
}

/** Canonical amount to roll into the next term's previousBalance field. */
export function computeCarryForwardBalance(
  lastInvoice: Invoice | null | undefined,
  student: Student | null | undefined,
  configuredDeskFee: number
): number {
  if (!lastInvoice || lastInvoice.isVoided) return 0;
  return computeInvoiceOwedAmount(lastInvoice, student ?? null, configuredDeskFee);
}

/**
 * After creating a new invoice with previousBalance, clear the same amount on the prior invoice
 * so prior + current terms are not double-counted.
 */
export function applyCarryForwardToPriorInvoice(
  priorInvoice: Invoice,
  amountCarried: number,
  targetInvoiceNumber: string
): void {
  const carried = parseFloat(parseAmount(amountCarried).toFixed(2));
  if (carried <= 0.005) return;

  const clearAmount = carried;
  priorInvoice.paidAmount = parseFloat(
    (parseAmount(priorInvoice.paidAmount) + clearAmount).toFixed(2)
  );
  recomputeInvoiceTotalsFromLineItems(priorInvoice);

  const note = `Balance ${clearAmount.toFixed(2)} carried forward to ${targetInvoiceNumber}`;
  const existing = String(priorInvoice.description || '').trim();
  priorInvoice.description = existing ? `${existing} | ${note}` : note;
}

/**
 * After a credit/debit note changes line items, outstanding must change by exactly `delta`
 * from `balanceBefore`. Adjusts the prepaid pool so canonical balance matches (prepaid must
 * not absorb new debit charges when the account looked settled).
 */
export function enforceInvoiceBalanceAfterNote(
  invoice: Invoice,
  balanceBefore: number,
  delta: number
): void {
  hydrateInvoiceLineItemsFromAmount(invoice);

  const expected = Math.max(0, parseFloat((balanceBefore + delta).toFixed(2)));
  const termFees = canonicalInvoiceTermFees(invoice);
  invoice.amount = termFees;

  const totalOwed = parseFloat(
    (tryNum(invoice.previousBalance) + termFees).toFixed(2)
  );
  const paid = tryNum(invoice.paidAmount);

  invoice.balance = expected;
  invoice.prepaidAmount = Math.max(
    0,
    parseFloat((totalOwed - paid - expected).toFixed(2))
  );

  const paidAmount = tryNum(invoice.paidAmount);
  if (expected <= 0.005) {
    invoice.status = InvoiceStatus.PAID;
  } else if (paidAmount > 0.005) {
    invoice.status = InvoiceStatus.PARTIAL;
  } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
    invoice.status = InvoiceStatus.OVERDUE;
  } else {
    invoice.status = InvoiceStatus.PENDING;
  }

  const actual = computeCanonicalInvoiceBalance(invoice);
  if (Math.abs(actual - expected) >= 0.005) {
    invoice.balance = expected;
    invoice.prepaidAmount = Math.max(
      0,
      parseFloat((totalOwed - paid - expected).toFixed(2))
    );
  }
}

/** Attach displayBalance on invoice payloads for list/detail APIs. */
export function withDisplayBalance<T extends Invoice>(
  invoice: T,
  student: Student | null | undefined,
  configuredDeskFee: number
): T & { displayBalance: number; balance: number } {
  const owed = computeInvoiceOwedAmount(invoice, student ?? null, configuredDeskFee);
  return {
    ...invoice,
    balance: owed,
    displayBalance: owed
  };
}
