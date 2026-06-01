import { Repository } from 'typeorm';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
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
export function computeCanonicalInvoiceBalance(invoice: Invoice | null | undefined): number {
  if (!invoice || invoice.isVoided) return 0;

  const termFees = canonicalInvoiceTermFees(invoice);
  const previousBalance = tryNum(invoice.previousBalance);
  const paidAmount = tryNum(invoice.paidAmount);
  const prepaid = tryNum(invoice.prepaidAmount);

  const totalOwed = parseFloat((previousBalance + termFees).toFixed(2));
  const appliedPrepaid = Math.min(prepaid, totalOwed);
  return Math.max(
    0,
    parseFloat((totalOwed - appliedPrepaid - paidAmount).toFixed(2))
  );
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
