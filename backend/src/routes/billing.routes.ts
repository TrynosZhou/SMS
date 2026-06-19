import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireFinancePageView } from '../middleware/requirePermission';
import { UserRole } from '../entities/User';
import {
  getStudentLedgerReport,
  getStudentLedgerReportPdf,
  getSchoolTermsForReports,
} from '../controllers/financialBooks.controller';

const router = Router();

const STUDENT_LEDGER_VIEWERS = [
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
  UserRole.ACCOUNTANT,
  UserRole.DEMO_USER,
];

router.use(authenticate);

router.get(
  '/reports/school-terms',
  authorize(...STUDENT_LEDGER_VIEWERS),
  requireFinancePageView('reportStudentLedger'),
  getSchoolTermsForReports
);
router.get(
  '/reports/student-ledger',
  authorize(...STUDENT_LEDGER_VIEWERS),
  requireFinancePageView('reportStudentLedger'),
  getStudentLedgerReport
);
router.get(
  '/reports/student-ledger/pdf',
  authorize(...STUDENT_LEDGER_VIEWERS),
  requireFinancePageView('reportStudentLedger'),
  getStudentLedgerReportPdf
);

export default router;
