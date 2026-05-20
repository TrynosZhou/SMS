import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  markAttendance,
  getAttendance,
  getAttendanceReport,
  getStudentTotalAttendance,
  deleteAttendance
} from '../controllers/attendance.controller';

const router = Router();

router.use(authenticate);

// Mark attendance (bulk for a class on a date)
router.post('/', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), markAttendance);

// Get attendance records
router.get('/', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), getAttendance);

// Delete attendance records for a class on a date
router.delete('/', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteAttendance);

// Get attendance report for a class
router.get('/report', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), getAttendanceReport);

// Get total attendance for a student (for report cards)
router.get('/student/total', getStudentTotalAttendance);

export default router;

