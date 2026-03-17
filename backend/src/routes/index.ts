import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './student.routes';
import examRoutes from './exam.routes';
import financeRoutes from './finance.routes';
import teacherRoutes from './teacher.routes';
import classRoutes from './class.routes';
import subjectRoutes from './subject.routes';
import settingsRoutes from './settings.routes';
import parentRoutes from './parent.routes';
import accountRoutes from './account.routes';
import messageRoutes from './message.routes';
<<<<<<< HEAD
import elearningRoutes from './elearning.routes';
=======
>>>>>>> 0a0a199c1f2947db9d1a0b24ba40d040883f145d
import attendanceRoutes from './attendance.routes';
import auditRoutes from './audit.routes';
import promotionRuleRoutes from './promotion-rule.routes';
import recordBookRoutes from './recordBook.routes';
import timetableRoutes from './timetable.routes';
import newsRoutes from './news.routes';
import payrollRoutes from './payroll.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/exams', examRoutes);
router.use('/finance', financeRoutes);
router.use('/teachers', teacherRoutes);
router.use('/classes', classRoutes);
router.use('/subjects', subjectRoutes);
router.use('/settings', settingsRoutes);
router.use('/parent', parentRoutes);
router.use('/account', accountRoutes);
router.use('/messages', messageRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/audit', auditRoutes);
router.use('/promotion-rules', promotionRuleRoutes);
router.use('/record-book', recordBookRoutes);
router.use('/timetables', timetableRoutes);
router.use('/news', newsRoutes);
router.use('/payroll', payrollRoutes);
<<<<<<< HEAD
router.use('/elearning', elearningRoutes);
=======
>>>>>>> 0a0a199c1f2947db9d1a0b24ba40d040883f145d

export default router;

