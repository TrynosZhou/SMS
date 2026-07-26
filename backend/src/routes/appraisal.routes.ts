import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import * as ctrl from '../controllers/appraisal.controller';

const router = Router();

const leadership = [
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ADMIN,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
];

const staffRoles = [...leadership, UserRole.TEACHER];

const portalRoles = [
  ...staffRoles,
  UserRole.PARENT,
  UserRole.STUDENT,
  UserRole.DEMO_USER,
];

router.use(authenticate);

router.get('/cycles', authorize(...portalRoles), ctrl.listCycles);
router.post('/cycles', authorize(...leadership), ctrl.createCycle);
router.put('/cycles/:id', authorize(...leadership), ctrl.updateCycle);
router.delete('/cycles/:id', authorize(...leadership), ctrl.deleteCycle);

router.get('/criteria', authorize(...portalRoles), ctrl.listCriteria);
router.post('/criteria', authorize(...leadership), ctrl.createCriterion);
router.put('/criteria/:id', authorize(...leadership), ctrl.updateCriterion);
router.delete('/criteria/:id', authorize(...leadership), ctrl.deleteCriterion);

router.get('/peer-assignments', authorize(...leadership), ctrl.listPeerAssignments);
router.post('/peer-assignments', authorize(...leadership), ctrl.createPeerAssignment);
router.delete('/peer-assignments/:id', authorize(...leadership), ctrl.deletePeerAssignment);
router.get('/my-peer-targets', authorize(...staffRoles), ctrl.myPeerTargets);

router.get('/appraisals', authorize(...portalRoles), ctrl.listAppraisals);
router.post('/appraisals', authorize(...portalRoles), ctrl.upsertAppraisal);
router.get('/teachers', authorize(...portalRoles), ctrl.listTeachersForFeedback);
router.get('/teachers/:teacherId/history', authorize(...staffRoles), ctrl.getTeacherHistory);
router.get('/teachers/:teacherId/cycles/:cycleId/summary', authorize(...staffRoles), ctrl.getTeacherCycleSummary);
router.get('/teachers/:teacherId/report.pdf', authorize(...staffRoles), ctrl.exportTeacherPdf);

router.get('/goals', authorize(...staffRoles), ctrl.listGoals);
router.post('/goals', authorize(...staffRoles), ctrl.upsertGoal);
router.delete('/goals/:id', authorize(...staffRoles), ctrl.deleteGoal);

router.get('/dashboard', authorize(...leadership), ctrl.getDashboard);
router.get('/reports/department.pdf', authorize(...leadership), ctrl.exportDepartmentPdf);

export default router;
