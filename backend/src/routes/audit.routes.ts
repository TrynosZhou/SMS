import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { logActivity, getUserSessions, exportUserSessionsCsv, exportUserSessionsPdf } from '../controllers/audit.controller';
import { getLoginAttempts } from '../controllers/login-attempts.controller';

const router = Router();

router.post('/activity', authenticate, logActivity);

const auditAdminGuard = [authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN)];

router.get('/user-sessions', ...auditAdminGuard, getUserSessions);
router.get('/login-attempts', ...auditAdminGuard, getLoginAttempts);
router.get('/user-sessions/export.csv', ...auditAdminGuard, exportUserSessionsCsv);
router.get('/user-sessions/export.pdf', ...auditAdminGuard, exportUserSessionsPdf);

export default router;
