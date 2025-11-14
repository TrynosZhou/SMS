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
  getStudentBalance
} from '../controllers/finance.controller';

const router = Router();

router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), createInvoice);
router.post('/bulk', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), createBulkInvoices);
router.get('/', authenticate, getInvoices);
router.get('/balance', authenticate, getStudentBalance);
router.get('/:id/pdf', authenticate, generateInvoicePDF);
router.get('/:id/receipt', authenticate, generateReceiptPDF);
router.put('/:id/payment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), updateInvoicePayment);
router.post('/calculate-balance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), calculateNextTermBalance);

export default router;

