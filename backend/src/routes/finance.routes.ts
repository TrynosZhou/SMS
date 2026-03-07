import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
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
  generateUniformReceiptPDF
} from '../controllers/finance.controller';

const router = Router();

// Allow SuperAdmin, Admin, Accountant, and Demo users to create single invoices
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createInvoice);
router.post('/bulk', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createBulkInvoices);
router.post('/bulk/reverse', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), reverseBulkInvoices);
router.post('/void/tuition-exempt', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), voidTuitionExemptInvoices);
router.get('/', authenticate, getInvoices);
router.get('/balance', authenticate, getStudentBalance);
router.get('/next-uniform-receipt', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), getNextUniformReceiptNumberController);
router.post('/uniform-charge', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createUniformCharge);
router.post('/uniform-payment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), recordUniformPayment);
router.get('/uniform-receipt/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), generateUniformReceiptPDF);
router.get('/outstanding-balances', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getOutstandingBalances);
router.get('/outstanding-balances/pdf', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getOutstandingBalancesPDF);
router.get('/cash-receipts', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getCashReceipts);
router.get('/cash-receipts/pdf', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getCashReceiptsPDF);
router.get('/audit/payment-logs', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPaymentLogs);
router.delete('/audit/payment-logs/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deletePaymentLog);
// Audit exports and summaries
router.get('/audit/payment-logs/export', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').exportPaymentLogsCSV)(req, res));
router.get('/audit/invoices/export', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').exportInvoicesCSV)(req, res));
router.get('/audit/payment-logs/summary', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').getPaymentLogsSummary)(req, res));
router.get('/audit/invoices/summary', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), (req, res) => (require('../controllers/finance.controller').getInvoicesSummary)(req, res));
router.post('/audit/payment-logs/normalize', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), (req, res) => (require('../controllers/finance.controller').normalizeHistoricalPaymentMethods)(req, res));

router.post('/repair/returning-desk-fee', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), repairReturningDeskFeeInvoices);

router.get('/:id/pdf', authenticate, generateInvoicePDF);
router.get('/:id/receipt', authenticate, generateReceiptPDF);
router.put('/:id/payment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), updateInvoicePayment);
router.post('/:id/prepayment/reverse', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), reverseInvoicePrepayment);
router.post('/calculate-balance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), calculateNextTermBalance);
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
