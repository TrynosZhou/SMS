import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  deleteAllExams,
  publishExam,
  publishExamByType,
  unpublishExamByType,
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
  generateMarkSheetPDF,
  generateMarkSheetExcel,
  getMarksEntryProgress,
  getPassRateInclusionsByScope,
  setPassRateInclusionByScope,
  deleteMark
} from '../controllers/exam.controller';

const router = Router();

router.use(authenticate);

router.post('/', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), createExam);
router.get('/', getExams);
router.put('/:id', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), updateExam);
router.post('/publish', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), publishExam);
router.post('/publish-by-type', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), publishExamByType);
router.post('/unpublish-by-type', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), unpublishExamByType);
router.post('/marks', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), captureMarks);
router.get('/marks', getMarks);
router.delete('/:examId/marks', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), deleteMark);
router.get('/pass-rate-inclusion', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), getPassRateInclusionsByScope);
router.post('/pass-rate-inclusion', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), setPassRateInclusionByScope);
router.get('/rankings/class', getStudentRankings);
router.get('/rankings/class-by-type', getClassRankingsByType);
router.get('/rankings/subject', getSubjectRankings);
router.get('/rankings/subject-by-type', getSubjectRankingsByType);
router.get('/rankings/form', getFormRankings);
router.get('/rankings/overall-performance', getOverallPerformanceRankings);
// Report cards: teachers can view; only parents, students, admins and superadmins can download PDF
router.get('/report-card', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.PARENT, UserRole.STUDENT, UserRole.TEACHER), getReportCard);
router.get('/report-card/pdf', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.PARENT, UserRole.STUDENT), generateReportCardPDF);
router.post('/report-card/remarks', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), saveReportCardRemarks);
router.get('/mark-sheet', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), generateMarkSheet);
router.get('/mark-sheet/pdf', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), generateMarkSheetPDF);
router.get('/mark-sheet/excel', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), generateMarkSheetExcel);
router.get('/marks-progress', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER), getMarksEntryProgress);
// Recompute grades across all classes using current settings (admin/superadmin only)
import { recomputeGrades } from '../controllers/exam.controller';
router.post('/recompute-grades', authorize(UserRole.SUPERADMIN, UserRole.ADMIN), recomputeGrades);
router.delete('/all', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), deleteAllExams);
// This route must be last to avoid conflicts with specific routes above
router.get('/:id', getExamById);
router.delete('/:id', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), deleteExam);

export default router;

