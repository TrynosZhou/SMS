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
 * Outstanding tuition/fees for one invoice — aligned with getOutstandingBalances (JSON)
 * and getStudentBalance: uses amount + previousBalance − paid − prepaid,
 * not the raw persisted invoice.balance column (which can be stale).
 *
 * When `logisticsFees` is set (parent portal / finance), the returned amount excludes any unpaid **transport**
 * bucket after the same waterfall as cash logistics (previous balance → transport → DH → tuition); DH may still show.
 */
export function computeInvoiceFeesOutstanding(
  invoice: Invoice | null | undefined,
  student: Student | null | undefined,
  configuredDeskFee: number,
  logisticsFees?: LogisticsFeesForOutstanding | null
): number {
  if (!invoice || invoice.isVoided) return 0;

  const lineItemTotal = canonicalInvoiceTermFees(invoice);
  const invoiceAmount = Math.max(tryNum(invoice.amount), lineItemTotal);
  let previousBalance = tryNum(invoice.previousBalance);
  const paidAmount = tryNum(invoice.paidAmount);
  const prepaidAmount = tryNum(invoice.prepaidAmount);

  const normalizedStatus = String((student as any)?.studentStatus || '').trim().toLowerCase();
  const isNewStudent = normalizedStatus === 'new';

  if (student && !isNewStudent && configuredDeskFee > 0) {
    const prev = Number(previousBalance.toFixed(2));
    const desk = Number(Number(configuredDeskFee).toFixed(2));
    if (prev === desk) {
      previousBalance = 0;
    }
  }

  const base = Math.max(
    0,
    parseFloat((invoiceAmount + previousBalance - paidAmount - prepaidAmount).toFixed(2))
  );

  if (!logisticsFees || !student) {
    return base;
  }

  const tr = tryNum(logisticsFees.transportCost);
  const dh = tryNum(logisticsFees.diningHallCost);
  const snap = snapshotFromInvoiceAndStudent(invoice, student);
  snap.previousBalance = previousBalance;
  const remaining = remainingBucketsAfterAppliedTotals(snap, tr, dh);
  return Math.max(0, outstandingExcludingTransportBucket(remaining));
}

/**
 * Amount owed on one invoice — same rules as outstanding-fees report:
 * max(persisted balance, computed from line items / amount).
 */
export function computeInvoiceOwedAmount(
  invoice: Invoice | null | undefined,
  student: Student | null | undefined,
  configuredDeskFee: number
): number {
  if (!invoice || invoice.isVoided) return 0;
  const fromColumn = tryNum(invoice.balance);
  const computed = computeInvoiceFeesOutstanding(invoice, student, configuredDeskFee);
  return parseFloat(Math.max(fromColumn, computed).toFixed(2));
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
