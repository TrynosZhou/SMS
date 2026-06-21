import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Settings } from '../entities/Settings';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import {
  applyRemediationCreditNote,
  DEFAULT_CREDIT_NOTE_REASON,
  DEFAULT_REVERSAL_REASON,
  previewRemediationPayments,
  reverseRemediationPayment,
  reverseRemediationPayments,
} from '../utils/invoiceSyncRemediation';
import {
  computeCanonicalInvoiceBalance,
  getConfiguredDeskFee,
  hydrateInvoiceLineItemsFromAmount,
  withDisplayBalance,
} from '../utils/invoiceFeesBalance';

function performerName(req: AuthRequest): string | null {
  const u = req.user;
  if (!u) return null;
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || null;
}

/** Step 1 — filter & preview payments for manual selection */
export const getRemediationPreview = async (req: AuthRequest, res: Response) => {
  try {
    const { studentIds, startDate, endDate } = req.query as {
      studentIds?: string;
      startDate?: string;
      endDate?: string;
    };

    const result = await previewRemediationPayments({
      studentIdsRaw: studentIds,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[getRemediationPreview]', error);
    res.status(400).json({ message: error.message || 'Failed to load remediation preview' });
  }
};

/** Step 2 — reverse selected payment(s) with audit trail */
export const postRemediationReverse = async (req: AuthRequest, res: Response) => {
  try {
    const { paymentLogIds, reason } = req.body as {
      paymentLogIds?: string[];
      reason?: string;
    };

    if (!Array.isArray(paymentLogIds) || !paymentLogIds.length) {
      return res.status(400).json({ message: 'Select at least one payment to reverse' });
    }

    const trimmedReason = String(reason || '').trim() || DEFAULT_REVERSAL_REASON;
    const userId = req.user?.id || null;
    const userName = performerName(req);

    const results = [];
    const rows = await reverseRemediationPayments({
      paymentLogIds,
      reason: trimmedReason,
      performedByUserId: userId,
      performedByName: userName,
    });
    for (const row of rows) {
      results.push({
        paymentLogId: row.paymentLogId,
        reversalLogId: row.reversal.id,
        invoiceId: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        amountReversed: Math.abs(parseFloat(String(row.original.amountPaid))),
        balanceBefore: row.balanceBefore,
        balanceAfter: row.balanceAfter,
        reversedAt: row.original.reversedAt,
        reversedByUserId: row.original.reversedByUserId,
      });
    }

    const studentId = results[0]
      ? (await AppDataSource.getRepository(Invoice).findOne({ where: { id: results[0].invoiceId } }))
          ?.studentId
      : null;
    const studentSummary = studentId ? await buildStudentBalanceSummary(studentId) : null;

    res.json({
      message: `${results.length} payment(s) reversed successfully`,
      reversals: results,
      student: studentSummary,
    });
  } catch (error: any) {
    console.error('[postRemediationReverse]', error);
    const status = error.message?.includes('already reversed') ? 409 : 400;
    res.status(status).json({ message: error.message || 'Failed to reverse payment(s)' });
  }
};

/** Step 3 — apply credit note for duplicated line item */
export const postRemediationCreditNote = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, item, amount, reason } = req.body as {
      invoiceId?: string;
      item?: 'tuition' | 'transport' | 'diningHall' | 'combined';
      amount?: number;
      reason?: string;
    };

    if (!invoiceId) {
      return res.status(400).json({ message: 'Invoice is required' });
    }
    if (!item || !['tuition', 'transport', 'diningHall', 'combined'].includes(item)) {
      return res.status(400).json({
        message: 'Invalid cost item. Must be tuition, transport, diningHall, or combined.',
      });
    }

    const result = await applyRemediationCreditNote({
      invoiceId,
      item,
      amount: Number(amount),
      reason: String(reason || '').trim() || DEFAULT_CREDIT_NOTE_REASON,
      performedByUserId: req.user?.id || null,
      performedByName: performerName(req),
    });

    const studentSummary = await buildStudentBalanceSummary(result.invoice.studentId);

    res.json({
      message: 'Credit note applied successfully',
      invoice: result.invoice,
      noteText: result.noteText,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      student: studentSummary,
    });
  } catch (error: any) {
    console.error('[postRemediationCreditNote]', error);
    res.status(400).json({ message: error.message || 'Failed to apply credit note' });
  }
};

async function buildStudentBalanceSummary(studentId: string) {
  const studentRepo = AppDataSource.getRepository(Student);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const settings = await AppDataSource.getRepository(Settings).findOne({
    where: {},
    order: { createdAt: 'DESC' },
  });
  const deskFee = getConfiguredDeskFee(settings);

  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: ['classEntity'],
  });
  if (!student) return null;

  const invoices = await invoiceRepo.find({
    where: { studentId, isVoided: false },
    order: { createdAt: 'DESC' },
  });

  let totalOutstanding = 0;
  const invoiceSummaries = invoices.map((inv) => {
    hydrateInvoiceLineItemsFromAmount(inv);
    const bal = computeCanonicalInvoiceBalance(inv);
    totalOutstanding += bal;
    const display = withDisplayBalance(inv, student, deskFee);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      term: inv.term,
      tuitionAmount: inv.tuitionAmount,
      transportAmount: inv.transportAmount,
      diningHallAmount: inv.diningHallAmount,
      registrationAmount: inv.registrationAmount,
      deskFeeAmount: inv.deskFeeAmount,
      balance: bal,
      displayBalance: (display as any).balance ?? bal,
    };
  });

  return {
    id: student.id,
    studentNumber: student.studentNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    className: (student as any).classEntity?.name || '',
    totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
    invoices: invoiceSummaries,
  };
}
