import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { logActivity, getUserSessions, exportUserSessionsCsv, exportUserSessionsPdf } from '../controllers/audit.controller';
import { getLoginAttempts } from '../controllers/login-attempts.controller';

const router = Router();

router.post('/activity', authenticate, logActivity);
router.get('/user-sessions', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), getUserSessions);
router.get('/login-attempts', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), getLoginAttempts);
router.get('/user-sessions/export.csv', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), exportUserSessionsCsv);
router.get('/user-sessions/export.pdf', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), exportUserSessionsPdf);

export default router;
