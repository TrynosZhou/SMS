import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  registerStudent,
  getStudents,
  getStudentById,
  enrollStudent,
  updateStudent,
  deleteStudent,
  promoteStudents,
  generateStudentIdCard
} from '../controllers/student.controller';
import { upload } from '../utils/upload';

const router = Router();

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT), upload.single('photo'), registerStudent);
router.get('/', authenticate, getStudents);
router.post('/enroll', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT), enrollStudent);
router.post('/promote', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT), promoteStudents);
router.get('/:id/id-card', authenticate, generateStudentIdCard);
router.get('/:id', authenticate, getStudentById);
router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT), upload.single('photo'), updateStudent);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT), deleteStudent);

export default router;

