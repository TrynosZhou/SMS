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
  createTeacherAccount,
  syncTeacherClasses,
  diagnoseTeacherClasses,
  searchTeacherByEmployeeId,
  linkTeacherAccount,
  generateTeacherIdCardPDF
} from '../controllers/teacher.controller';

const router = Router();

router.use(authenticate);

// IMPORTANT: /me must come BEFORE /:id to avoid matching 'me' as an id
router.post('/', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), registerTeacher);
router.get('/', getTeachers);
router.get('/me', getCurrentTeacher); // Must be before /:id
router.get('/search', searchTeacherByEmployeeId); // Search teacher by EmployeeID
router.post('/link-account', authorize(UserRole.TEACHER), linkTeacherAccount); // Link teacher account
router.post('/sync-classes', authorize(UserRole.SUPERADMIN, UserRole.ADMIN), syncTeacherClasses); // Sync endpoint
router.get('/:teacherId/diagnose', authorize(UserRole.SUPERADMIN, UserRole.ADMIN), diagnoseTeacherClasses); // Diagnostic endpoint
router.get('/:id/id-card/pdf', generateTeacherIdCardPDF);
router.get('/:id/classes', getTeacherClasses); // Specific routes before /:id
router.get('/:id', getTeacherById);
router.post('/:id/create-account', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), createTeacherAccount);
router.put('/:id', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), updateTeacher);
router.delete('/:id', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), deleteTeacher);

export default router;

