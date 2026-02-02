import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createInvoice,
  getInvoices,
  updateInvoicePayment,
  calculateNextTermBalance,
  createBulkInvoices,
  generateInvoicePDF,
  generateReceiptPDF,
  getStudentBalance,
  getOutstandingBalances
} from '../controllers/finance.controller';

const router = Router();

// Only SuperAdmin can create invoices (single) - matches /invoices/new page restriction
router.post('/', authenticate, authorize(UserRole.SUPERADMIN), createInvoice);
router.post('/bulk', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createBulkInvoices);
router.get('/', authenticate, getInvoices);
router.get('/balance', authenticate, getStudentBalance);
router.get('/outstanding-balances', authenticate, getOutstandingBalances);
router.get('/:id/pdf', authenticate, generateInvoicePDF);
router.get('/:id/receipt', authenticate, generateReceiptPDF);
router.put('/:id/payment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), updateInvoicePayment);
router.post('/calculate-balance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), calculateNextTermBalance);

export default router;
