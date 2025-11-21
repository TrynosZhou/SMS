import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getRecordBookByClass,
  saveRecordBookMarks,
  batchSaveRecordBookMarks
} from '../controllers/recordBook.controller';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticate);
router.use(authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER));

// Get record book for a specific class
router.get('/class/:classId', getRecordBookByClass);

// Save marks for a single student
router.post('/marks', saveRecordBookMarks);

// Batch save marks for multiple students
router.post('/marks/batch', batchSaveRecordBookMarks);

export default router;

