import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  requireFinancePageEdit,
  requireFinancePageView,
  requireModuleView,
  requirePermission,
} from '../middleware/requirePermission';
import { UserRole } from '../entities/User';
import {
  createInvoice,
  getInvoices,
  updateInvoicePayment,
  calculateNextTermBalance,
  createBulkInvoices,
  reverseBulkInvoices,
  voidTuitionExemptInvoices,
  generateInvoicePDF,
  generateReceiptPDF,
  getStudentBalance,
  getOutstandingBalances,
  getOutstandingBalancesPDF,
  getExemptionReport,
  getExemptionReportPDF,
  syncStudentExemptionInvoices,
  adjustInvoiceLogistics,
  applyInvoiceNote,
  getPaymentLogs,
  deletePaymentLog,
  getCashReceipts,
  getCashReceiptsPDF,
  repairReturningDeskFeeInvoices,
  reverseInvoicePrepayment,
  createUniformCharge,
  recordUniformPayment,
  getNextUniformReceiptNumberController,
  generateUniformReceiptPDF,
} from '../controllers/finance.controller';
import {
  getBalanceSheet,
  getDebtorsAging,
  getClassDebtSummary,
  getRecentPayments,
  getDebtorsList,
  getCashbook,
  postCashbookEntry,
  getStudentStatement,
  getStudentStatementPdf,
  sendDebtorReminders,
} from '../controllers/financialBooks.controller';

const router = Router();

/** Executive + operations roles that may use finance APIs */
const FINANCE_OPERATORS = [
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ACCOUNTANT,
  UserRole.DEMO_USER,
];

const FINANCE_OPERATORS_NO_DEMO = [
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ACCOUNTANT,
];

const FINANCE_EXECUTIVE = [UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DIRECTOR];

/** Admin, Director, Principal (Headmaster) — finance books dashboard */
const FINANCIAL_BOOKS_VIEWERS = [
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
  UserRole.ACCOUNTANT,
];

router.use(authenticate);

// Allow SuperAdmin, Admin, Accountant, and Demo users to create single invoices
router.post('/', authorize(...FINANCE_OPERATORS), requirePermission('finance', 'create'), createInvoice);
router.post(
  '/bulk',
  authorize(...FINANCE_OPERATORS),
  requireFinancePageEdit('bulkInvoices'),
  createBulkInvoices
);
router.post(
  '/bulk/reverse',
  authorize(...FINANCE_OPERATORS),
  requireFinancePageEdit('bulkInvoices'),
  reverseBulkInvoices
);
router.post(
  '/void/tuition-exempt',
  authorize(...FINANCE_OPERATORS_NO_DEMO),
  requireFinancePageEdit('exemptionCorrection'),
  voidTuitionExemptInvoices
);
router.get('/', requireModuleView('finance'), getInvoices);
router.get('/balance', getStudentBalance);
router.get('/next-uniform-receipt', authorize(...FINANCE_OPERATORS), getNextUniformReceiptNumberController);
router.post('/uniform-charge', authorize(...FINANCE_OPERATORS), createUniformCharge);
router.post('/uniform-payment', authorize(...FINANCE_OPERATORS), recordUniformPayment);
router.get('/uniform-receipt/:id', authorize(...FINANCE_OPERATORS), generateUniformReceiptPDF);
router.get('/outstanding-balances', authorize(...FINANCE_OPERATORS_NO_DEMO), getOutstandingBalances);
router.get('/outstanding-balances/pdf', authorize(...FINANCE_OPERATORS_NO_DEMO), getOutstandingBalancesPDF);
router.get('/exemption-report', authorize(...FINANCE_OPERATORS_NO_DEMO), getExemptionReport);
router.get('/exemption-report/pdf', authorize(...FINANCE_OPERATORS_NO_DEMO), getExemptionReportPDF);
router.post(
  '/students/:studentId/sync-exemption-invoices',
  authenticate,
  authorize(...FINANCE_OPERATORS_NO_DEMO),
  syncStudentExemptionInvoices
);
router.get('/cash-receipts', authorize(...FINANCE_OPERATORS_NO_DEMO), getCashReceipts);
router.get('/cash-receipts/pdf', authorize(...FINANCE_OPERATORS_NO_DEMO), getCashReceiptsPDF);

// Financial Books dashboard
router.get(
  '/balance-sheet',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getBalanceSheet
);
router.get(
  '/debtors-aging',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getDebtorsAging
);
router.get(
  '/class-debt-summary',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getClassDebtSummary
);
router.get(
  '/recent-payments',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getRecentPayments
);
router.get(
  '/debtors',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getDebtorsList
);
router.get(
  '/cashbook',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getCashbook
);
router.post(
  '/cashbook',
  authorize(...FINANCE_EXECUTIVE),
  requireFinancePageEdit('financialBooks'),
  postCashbookEntry
);
router.get(
  '/statement/:studentId',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getStudentStatement
);
router.get(
  '/statement/:studentId/pdf',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageView('financialBooks'),
  getStudentStatementPdf
);
router.post(
  '/reminders/send',
  authorize(...FINANCIAL_BOOKS_VIEWERS),
  requireFinancePageEdit('financialBooks'),
  sendDebtorReminders
);

router.get('/audit/payment-logs', authorize(...FINANCE_OPERATORS_NO_DEMO), getPaymentLogs);
router.delete('/audit/payment-logs/:id', authorize(...FINANCE_EXECUTIVE), deletePaymentLog);
// Audit exports and summaries
router.get('/audit/payment-logs/export', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').exportPaymentLogsCSV)(req, res));
router.get('/audit/invoices/export', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').exportInvoicesCSV)(req, res));
router.get('/audit/payment-logs/summary', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').getPaymentLogsSummary)(req, res));
router.get('/audit/invoices/summary', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').getInvoicesSummary)(req, res));
router.post('/audit/payment-logs/normalize', authorize(...FINANCE_EXECUTIVE), (req, res) => (require('../controllers/finance.controller').normalizeHistoricalPaymentMethods)(req, res));
router.get('/audit/reconcile-term-outstanding', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').reconcileTermOutstanding)(req, res));
router.get('/audit/invoice-reconciliation', authorize(...FINANCE_OPERATORS_NO_DEMO), (req, res) => (require('../controllers/finance.controller').auditInvoiceReconciliation)(req, res));

router.post('/repair/returning-desk-fee', authorize(...FINANCE_EXECUTIVE), repairReturningDeskFeeInvoices);

router.get('/:id/pdf', generateInvoicePDF);
router.get('/:id/receipt', generateReceiptPDF);
router.put('/:id/payment', authorize(...FINANCE_OPERATORS), updateInvoicePayment);
router.post('/:id/prepayment/reverse', authorize(...FINANCE_EXECUTIVE), reverseInvoicePrepayment);
router.post('/calculate-balance', authorize(...FINANCE_OPERATORS), calculateNextTermBalance);
router.put(
  '/:id/logistics',
  authenticate,
  authorize(...FINANCE_OPERATORS),
  adjustInvoiceLogistics
);
router.put(
  '/:id/note',
  authenticate,
  authorize(...FINANCE_OPERATORS),
  applyInvoiceNote
);

export default router;
