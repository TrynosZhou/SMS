import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { requireModuleView, requirePermission } from '../middleware/requirePermission';
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
router.post('/', requirePermission('staff', 'create'), registerTeacher);
router.get('/', requireModuleView('staff'), getTeachers);
router.get('/me', getCurrentTeacher); // Must be before /:id
router.get('/search', searchTeacherByEmployeeId); // Search teacher by EmployeeID
router.post('/link-account', authorize(UserRole.TEACHER), linkTeacherAccount); // Link teacher account
router.post('/sync-classes', requirePermission('staff', 'edit'), syncTeacherClasses);
router.get('/:teacherId/diagnose', requirePermission('staff', 'view'), diagnoseTeacherClasses);
router.get('/:id/id-card/pdf', requireModuleView('staff'), generateTeacherIdCardPDF);
router.get('/:id/classes', getTeacherClasses);
router.get('/:id', requireModuleView('staff'), getTeacherById);
router.post('/:id/create-account', requirePermission('staff', 'create'), createTeacherAccount);
router.put('/:id', requirePermission('staff', 'edit'), updateTeacher);
router.delete('/:id', requirePermission('staff', 'delete'), deleteTeacher);

export default router;

