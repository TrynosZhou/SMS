import { Repository } from 'typeorm';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

/**
 * Desk fee from settings (same shape as finance / outstanding-balance).
 */
export function getConfiguredDeskFee(settings: Settings | null | undefined): number {
  if (!settings || !(settings as any).feesSettings) return 0;
  return Number((settings as any).feesSettings.deskFee || 0);
}

/**
 * Outstanding tuition/fees for one invoice — aligned with getOutstandingBalances (JSON)
 * and getStudentBalance: uses amount + previousBalance − paid − prepaid,
 * not the raw persisted invoice.balance column (which can be stale).
 */
export function computeInvoiceFeesOutstanding(
  invoice: Invoice | null | undefined,
  student: Student | null | undefined,
  configuredDeskFee: number
): number {
  if (!invoice || invoice.isVoided) return 0;

  const tryNum = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);
  const invoiceAmount = tryNum(invoice.amount);
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

  return Math.max(
    0,
    parseFloat((invoiceAmount + previousBalance - paidAmount - prepaidAmount).toFixed(2))
  );
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
