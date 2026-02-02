import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { updateAccount, getAccountInfo, createUserAccount, resetUserPassword, getUniversalTeacherStatus, createUniversalTeacherAccount } from '../controllers/account.controller';
import { UserRole } from '../entities/User';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get account info (all authenticated users)
router.get('/', getAccountInfo);

// Update account (all authenticated users - teachers, parents, students)
router.put('/', updateAccount);

// Admin/SuperAdmin can create user accounts
router.post(
  '/users',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  createUserAccount
);

// Admin/SuperAdmin can reset user passwords
router.post(
  '/reset-password',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  resetUserPassword
);

// Universal teacher account (admin/superadmin only)
router.get(
  '/universal-teacher',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  getUniversalTeacherStatus
);
router.post(
  '/universal-teacher',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  createUniversalTeacherAccount
);

export default router;

