import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { requireModuleView, requirePermission } from '../middleware/requirePermission';
import {
  getCurrentParentProfile,
  getParentStudents,
  linkStudent,
  linkStudentByIdAndDob,
  unlinkStudent,
  searchStudents,
  adminSearchParentEmails,
  adminListParents,
  adminCreateParent,
  adminLinkStudentToParent,
  adminUnlinkStudentFromParent,
  adminUpdateParent,
  adminDeleteParent,
  adminResetParentPassword
} from '../controllers/parent.controller';

const router = Router();

router.use(authenticate);

// Get current parent's profile
router.get(
  '/profile',
  authorize(UserRole.PARENT, UserRole.DEMO_USER),
  getCurrentParentProfile
);

router.get(
  '/students',
  authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN),
  getParentStudents
);

router.post(
  '/link-student',
  authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN),
  linkStudent
);

router.post(
  '/link-student-by-id-dob',
  authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN),
  linkStudentByIdAndDob
);

router.delete(
  '/unlink-student/:studentId',
  authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN),
  unlinkStudent
);

router.get(
  '/search-students',
  authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN),
  searchStudents
);

router.get('/admin/parents/search-emails', requireModuleView('parents'), adminSearchParentEmails);

router.get('/admin/parents', requireModuleView('parents'), adminListParents);

router.post('/admin/parents', requirePermission('parents', 'create'), adminCreateParent);

router.get('/staff/parents', requireModuleView('parents'), adminListParents);

router.put('/admin/parents/:parentId', requirePermission('parents', 'edit'), adminUpdateParent);

router.delete('/admin/parents/:parentId', requirePermission('parents', 'delete'), adminDeleteParent);

router.post(
  '/admin/reset-parent-password',
  requirePermission('parents', 'edit'),
  adminResetParentPassword
);

router.post(
  '/admin/link-student',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminLinkStudentToParent
);

router.delete(
  '/admin/unlink-student/:linkId',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminUnlinkStudentFromParent
);

export default router;
