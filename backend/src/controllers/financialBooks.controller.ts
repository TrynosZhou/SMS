import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { CashbookEntryType } from '../entities/CashbookEntry';
import {
  applyStudentPaymentFromCashbook,
  createManualCashbookEntry,
  fetchBalanceSheetSummary,
  fetchCashbookEntries,
  fetchClassDebtSummary,
  fetchDebtorRows,
  fetchDebtorsAging,
  fetchRecentPayments,
  fetchStudentStatement,
  findLatestInvoiceIdForStudent,
  reconcileOrphanCashbookStudentReceipts,
  sendFeeRemindersToDebtors,
} from '../utils/financialBooks';

import { Settings } from '../entities/Settings';
import {
  buildStudentLedgerReport,
  loadAcademicTerms,
  searchStudentsForLedger,
} from '../utils/studentLedgerReport';
import { createStudentLedgerPDF } from '../utils/studentLedgerPdfGenerator';

export const getBalanceSheet = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const data = await fetchBalanceSheetSummary();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching balance sheet:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getDebtorsAging = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const data = await fetchDebtorsAging();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching debtors aging:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getClassDebtSummary = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const data = await fetchClassDebtSummary();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching class debt summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getRecentPayments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const limit = parseInt(String(req.query.limit || '12'), 10);
    const data = await fetchRecentPayments(limit);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching recent payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getDebtorsList = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const data = await fetchDebtorRows();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching debtors:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getCashbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { from, to, search } = req.query as { from?: string; to?: string; search?: string };
    const data = await fetchCashbookEntries({ from, to, search });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching cashbook:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const postCashbookEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { entryDate, type, description, amount, paymentMethod, reference, studentId, invoiceId } =
      req.body as {
        entryDate?: string;
        type?: string;
        description?: string;
        amount?: number;
        paymentMethod?: string;
        reference?: string;
        studentId?: string;
        invoiceId?: string;
      };

    if (!entryDate || !type || !description || amount == null) {
      return res.status(400).json({ message: 'entryDate, type, description, and amount are required' });
    }

    const normalizedType =
      String(type).toLowerCase() === CashbookEntryType.PAYMENT
        ? CashbookEntryType.PAYMENT
        : CashbookEntryType.RECEIPT;

    if (normalizedType === CashbookEntryType.RECEIPT) {
      if (!studentId) {
        return res.status(400).json({ message: 'studentId is required for receipt entries' });
      }

      const payer = req.user;
      const payerName = payer ? `${payer.firstName || ''} ${payer.lastName || ''}`.trim() : null;
      const result = await applyStudentPaymentFromCashbook({
        studentId,
        invoiceId,
        paidAmount: Number(amount),
        paymentDate: entryDate,
        paymentMethod,
        notes: description,
        payerUserId: payer?.id,
        payerName: payerName || null,
        receiptNumber: reference,
      });

      return res.status(201).json({
        message: 'Payment recorded and applied to student invoice',
        paymentLogId: result.paymentLog.id,
        invoiceId: result.invoice.id,
        receiptNumber: result.paymentLog.receiptNumber,
        invoiceBalance: result.invoice.balance,
      });
    }

    const entry = await createManualCashbookEntry({
      entryDate,
      type: normalizedType,
      description,
      amount: Number(amount),
      paymentMethod,
      reference,
      createdById: req.user?.id,
    });

    res.status(201).json(entry);
  } catch (error: any) {
    console.error('Error creating cashbook entry:', error);
    res.status(500).json({ message: error.message || 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentStatement = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId } = req.params;
    const data = await fetchStudentStatement(studentId);
    if (!data) return res.status(404).json({ message: 'Student not found' });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching student statement:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentStatementPdf = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId } = req.params;
    const invoiceId = await findLatestInvoiceIdForStudent(studentId);
    if (!invoiceId) {
      return res.status(404).json({ message: 'No invoice found for this student' });
    }
    const { generateInvoicePDF } = await import('./finance.controller');
    req.params.id = invoiceId;
    return generateInvoicePDF(req as any, res);
  } catch (error: any) {
    console.error('Error generating student statement PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const sendDebtorReminders = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentIds } = req.body as { studentIds?: string[] };
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds array is required' });
    }
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const result = await sendFeeRemindersToDebtors(studentIds, {
      id: user.id,
      email: user.email,
      name: user.email,
    });
    res.json({ sent: result.sent, skipped: result.skipped });
  } catch (error: any) {
    console.error('Error sending fee reminders:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

async function loadSchoolBrandingForLedger(): Promise<{
  schoolName: string;
  currencySymbol: string;
  schoolLogo: string | null;
  schoolEmail: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
}> {
  const settingsRepository = AppDataSource.getRepository(Settings);
  const rows = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
  const settings = rows[0];
  return {
    schoolName: String(settings?.schoolName || 'School').trim() || 'School',
    currencySymbol: String(settings?.currencySymbol || '$').trim() || '$',
    schoolLogo: settings?.schoolLogo ?? null,
    schoolEmail: settings?.schoolEmail ?? null,
    schoolPhone: settings?.schoolPhone ?? null,
    schoolAddress: settings?.schoolAddress ?? null,
  };
}

export const getStudentLedgerReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const termId = String(req.query.termId || '').trim();
    const studentId = String(req.query.studentId || '').trim();
    const q = String(req.query.q || '').trim();

    if (!termId) {
      return res.status(400).json({ message: 'termId is required' });
    }
    if (!studentId && !q) {
      return res.status(400).json({ message: 'studentId or q (search) is required' });
    }

    if (studentId) {
      const report = await buildStudentLedgerReport(studentId, termId);
      if (!report) {
        return res.status(404).json({ message: 'Student or term not found' });
      }
      return res.json({ needsSelection: false, report });
    }

    const matches = await searchStudentsForLedger(q);
    if (matches.length === 0) {
      return res.status(404).json({ message: 'No students matched your search' });
    }
    if (matches.length === 1) {
      const report = await buildStudentLedgerReport(matches[0].id, termId);
      if (!report) {
        return res.status(404).json({ message: 'Could not build ledger report' });
      }
      return res.json({ needsSelection: false, report });
    }

    return res.json({ needsSelection: true, matches });
  } catch (error: any) {
    console.error('[StudentLedgerReport] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentLedgerReportPdf = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const termId = String(req.query.termId || '').trim();
    const studentId = String(req.query.studentId || '').trim();
    const preview = String(req.query.preview || '').toLowerCase() === 'true';

    if (!termId || !studentId) {
      return res.status(400).json({ message: 'termId and studentId are required for PDF export' });
    }

    const report = await buildStudentLedgerReport(studentId, termId);
    if (!report) {
      return res.status(404).json({ message: 'Student or term not found' });
    }

    const branding = await loadSchoolBrandingForLedger();
    const buffer = await createStudentLedgerPDF({
      schoolName: branding.schoolName,
      currencySymbol: branding.currencySymbol,
      schoolLogo: branding.schoolLogo,
      schoolEmail: branding.schoolEmail,
      schoolPhone: branding.schoolPhone,
      schoolAddress: branding.schoolAddress,
      report,
      generatedAt: new Date(),
    });

    const filename = `student-ledger-${report.student.admissionNumber}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `${preview ? 'inline' : 'attachment'}; filename="${filename}"`
    );
    res.send(buffer);
  } catch (error: any) {
    console.error('[StudentLedgerReportPdf] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getSchoolTermsForReports = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const terms = await loadAcademicTerms();
    const settingsRepository = AppDataSource.getRepository(Settings);
    const rows = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = rows[0];
    res.json({
      terms,
      activeTermId:
        terms.find((t) => t.name === settings?.activeTerm || t.label === settings?.activeTerm)?.id ||
        terms[0]?.id ||
        null,
      activeTerm: settings?.activeTerm || null,
    });
  } catch (error: any) {
    console.error('[SchoolTerms] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};
