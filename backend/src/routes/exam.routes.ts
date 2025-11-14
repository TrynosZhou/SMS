import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createExam,
  getExams,
  getExamById,
  deleteExam,
  deleteAllExams,
  publishExam,
  publishExamByType,
  captureMarks,
  getMarks,
  getStudentRankings,
  getSubjectRankings,
  getClassRankingsByType,
  getSubjectRankingsByType,
  getFormRankings,
  getOverallPerformanceRankings,
  getReportCard,
  generateReportCardPDF,
  saveReportCardRemarks,
  generateMarkSheet,
  generateMarkSheetPDF
} from '../controllers/exam.controller';

const router = Router();

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), createExam);
router.get('/', authenticate, getExams);
router.post('/publish', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), publishExam);
router.post('/publish-by-type', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), publishExamByType);
router.post('/marks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), captureMarks);
router.get('/marks', authenticate, getMarks);
router.get('/rankings/class', authenticate, getStudentRankings);
router.get('/rankings/class-by-type', authenticate, getClassRankingsByType);
router.get('/rankings/subject', authenticate, getSubjectRankings);
router.get('/rankings/subject-by-type', authenticate, getSubjectRankingsByType);
router.get('/rankings/form', authenticate, getFormRankings);
router.get('/rankings/overall-performance', authenticate, getOverallPerformanceRankings);
router.get('/report-card', authenticate, getReportCard);
router.get('/report-card/pdf', authenticate, generateReportCardPDF);
router.post('/report-card/remarks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), saveReportCardRemarks);
router.get('/mark-sheet', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), generateMarkSheet);
router.get('/mark-sheet/pdf', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), generateMarkSheetPDF);
router.delete('/all', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), deleteAllExams);
// This route must be last to avoid conflicts with specific routes above
router.get('/:id', authenticate, getExamById);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), deleteExam);

export default router;

