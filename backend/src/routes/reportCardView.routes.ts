import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { getUnviewedParents, notifyParent, sendReportCard, previewReportCardAdmin } from '../controllers/reportCardView.controller';

const router = Router();

router.use(authenticate);

/**
 * Admin "Report Cards" outreach tool endpoints.
 * Restricted to administrative / leadership roles.
 */
const adminRoles = [
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ADMIN,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER
];

// List parents who have not yet viewed their linked children's report cards.
router.get(
  '/unviewed-parents',
  authorize(...adminRoles),
  getUnviewedParents
);

// Fast admin-only report-card PDF preview (no fee checks, parallelised queries).
router.get(
  '/preview-pdf',
  authorize(...adminRoles),
  previewReportCardAdmin
);

// Send a WhatsApp nudge to a parent about a specific child's report card.
router.post(
  '/notify',
  authorize(...adminRoles),
  notifyParent
);

// Generate the student's report card PDF and send it to the parent via WhatsApp.
router.post(
  '/send-report-card',
  authorize(...adminRoles),
  sendReportCard
);

export default router;
