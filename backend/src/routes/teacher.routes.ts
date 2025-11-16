import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  registerTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
  getTeacherClasses,
  createTeacherAccount
} from '../controllers/teacher.controller';

const router = Router();

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), registerTeacher);
router.get('/', authenticate, getTeachers);
router.get('/:id', authenticate, getTeacherById);
router.get('/:id/classes', authenticate, getTeacherClasses);
router.post('/:id/create-account', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), createTeacherAccount);
router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), updateTeacher);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), deleteTeacher);

export default router;

