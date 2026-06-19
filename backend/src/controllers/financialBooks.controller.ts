import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { CashbookEntryType } from '../entities/CashbookEntry';
import {
  createManualCashbookEntry,
  fetchBalanceSheetSummary,
  fetchCashbookEntries,
  fetchClassDebtSummary,
  fetchDebtorRows,
  fetchDebtorsAging,
  fetchRecentPayments,
  fetchStudentStatement,
  findLatestInvoiceIdForStudent,
  sendFeeRemindersToDebtors,
} from '../utils/financialBooks';

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
    const { entryDate, type, description, amount, paymentMethod, reference } = req.body as {
      entryDate?: string;
      type?: string;
      description?: string;
      amount?: number;
      paymentMethod?: string;
      reference?: string;
    };

    if (!entryDate || !type || !description || amount == null) {
      return res.status(400).json({ message: 'entryDate, type, description, and amount are required' });
    }

    const normalizedType =
      String(type).toLowerCase() === CashbookEntryType.PAYMENT
        ? CashbookEntryType.PAYMENT
        : CashbookEntryType.RECEIPT;

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
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
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
