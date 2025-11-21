import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  registerTeacher,
  getTeachers,
  getCurrentTeacher,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
  getTeacherClasses,
  createTeacherAccount
} from '../controllers/teacher.controller';

const router = Router();

// IMPORTANT: /me must come BEFORE /:id to avoid matching 'me' as an id
router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), registerTeacher);
router.get('/', authenticate, getTeachers);
router.get('/me', authenticate, getCurrentTeacher); // Must be before /:id
router.get('/:id/classes', authenticate, getTeacherClasses); // Specific routes before /:id
router.get('/:id', authenticate, getTeacherById);
router.post('/:id/create-account', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), createTeacherAccount);
router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), updateTeacher);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), deleteTeacher);

export default router;

