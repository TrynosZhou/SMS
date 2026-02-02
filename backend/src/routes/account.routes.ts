import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { updateAccount, getAccountInfo, createUserAccount, resetUserPassword, updateUserRole, getUniversalTeacherStatus, createUniversalTeacherAccount } from '../controllers/account.controller';
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

// Admin/SuperAdmin can change a user's role (Admin cannot set role to superadmin)
router.patch(
  '/users/:id/role',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  updateUserRole
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

