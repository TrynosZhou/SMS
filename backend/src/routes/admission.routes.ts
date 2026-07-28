import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { optionalAdmissionUpload } from '../utils/admissionUpload';
import {
  createApplication,
  downloadDocument,
  getApplication,
  listApplicationsAdmin,
  listClassesForApplication,
  listMyApplications,
  updateApplication,
  updateApplicationStatus,
  enrollFromApplication,
  sendWhatsAppToApplicant,
} from '../controllers/admission.controller';

const router = Router();

router.use(authenticate);

router.get('/classes', listClassesForApplication);
router.get('/mine', listMyApplications);
router.get('/admin/list', listApplicationsAdmin);
router.get('/:id', getApplication);
router.post('/', optionalAdmissionUpload, createApplication);
router.put('/:id', optionalAdmissionUpload, updateApplication);
router.patch('/:id/status', updateApplicationStatus);
router.post('/:id/enroll', enrollFromApplication);
router.post('/:id/whatsapp', sendWhatsAppToApplicant);
router.get('/:applicationId/documents/:docId/download', downloadDocument);

export default router;
