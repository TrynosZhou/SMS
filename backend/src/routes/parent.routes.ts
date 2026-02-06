import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getParentStudents,
  linkStudent,
  linkStudentByIdAndDob,
  unlinkStudent,
  searchStudents,
  adminListParents,
  adminLinkStudentToParent,
  adminUnlinkStudentFromParent,
  adminUpdateParent,
  adminDeleteParent
} from '../controllers/parent.controller';

const router = Router();

router.use(authenticate);

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

router.get(
  '/admin/parents',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminListParents
);

router.put(
  '/admin/parents/:parentId',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminUpdateParent
);

router.delete(
  '/admin/parents/:parentId',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminDeleteParent
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

