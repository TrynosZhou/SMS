import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createRole,
  deleteRole,
  getMyPermissions,
  getRbacCatalog,
  listRoles,
  listUsersWithRoles,
  updateRole,
  updateUserRoles,
} from '../controllers/rbac.controller';

const router = Router();

router.get('/me', authenticate, getMyPermissions);

router.use(authenticate, authorize(UserRole.SUPERADMIN, UserRole.DIRECTOR, UserRole.ADMIN));

router.get('/catalog', getRbacCatalog);
router.get('/roles', listRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);
router.get('/users', listUsersWithRoles);
router.put('/users/:userId/roles', updateUserRoles);

export default router;
