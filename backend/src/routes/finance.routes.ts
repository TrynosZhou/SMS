import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  requireFinancePageEdit,
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

const router = Router();

router.use(authenticate);

// Allow SuperAdmin, Admin, Accountant, and Demo users to create single invoices
router.post('/', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), requirePermission('finance', 'create'), createInvoice);
router.post(
  '/bulk',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  requireFinancePageEdit('bulkInvoices'),
  createBulkInvoices
);
router.post(
  '/bulk/reverse',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  requireFinancePageEdit('bulkInvoices'),
  reverseBulkInvoices
);
router.post(
  '/void/tuition-exempt',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  requireFinancePageEdit('exemptionCorrection'),
  voidTuitionExemptInvoices
);
router.get('/', requireModuleView('finance'), getInvoices);
router.get('/balance', getStudentBalance);
router.get('/next-uniform-receipt', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), getNextUniformReceiptNumberController);
router.post('/uniform-charge', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createUniformCharge);
router.post('/uniform-payment', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), recordUniformPayment);
router.get('/uniform-receipt/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), generateUniformReceiptPDF);
router.get('/outstanding-balances', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getOutstandingBalances);
router.get('/outstanding-balances/pdf', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getOutstandingBalancesPDF);
router.get('/exemption-report', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getExemptionReport);
router.get('/exemption-report/pdf', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getExemptionReportPDF);
router.post(
  '/students/:studentId/sync-exemption-invoices',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  syncStudentExemptionInvoices
);
router.get('/cash-receipts', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getCashReceipts);
router.get('/cash-receipts/pdf', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getCashReceiptsPDF);
router.get('/audit/payment-logs', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPaymentLogs);
router.delete('/audit/payment-logs/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deletePaymentLog);
// Audit exports and summaries
router.get('/audit/payment-logs/export', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').exportPaymentLogsCSV)(req, res));
router.get('/audit/invoices/export', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').exportInvoicesCSV)(req, res));
router.get('/audit/payment-logs/summary', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').getPaymentLogsSummary)(req, res));
router.get('/audit/invoices/summary', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').getInvoicesSummary)(req, res));
router.post('/audit/payment-logs/normalize', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), (req, res) => (require('../controllers/finance.controller').normalizeHistoricalPaymentMethods)(req, res));
router.get('/audit/reconcile-term-outstanding', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').reconcileTermOutstanding)(req, res));
router.get('/audit/invoice-reconciliation', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').auditInvoiceReconciliation)(req, res));

router.post('/repair/returning-desk-fee', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), repairReturningDeskFeeInvoices);

router.get('/:id/pdf', generateInvoicePDF);
router.get('/:id/receipt', generateReceiptPDF);
router.put('/:id/payment', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), updateInvoicePayment);
router.post('/:id/prepayment/reverse', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), reverseInvoicePrepayment);
router.post('/calculate-balance', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), calculateNextTermBalance);
router.put(
  '/:id/logistics',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  adjustInvoiceLogistics
);
router.put(
  '/:id/note',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  applyInvoiceNote
);

export default router;
