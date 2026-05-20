import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  listFeatures,
  createFeature,
  updateFeature,
  deactivateFeature,
  listTiersWithFeatures,
  grantTierFeature,
  revokeTierFeature,
  getLicenseAuditLog
} from '../controllers/licenseAdmin.controller';

const router = Router();

const adminOnly = [authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN)];

router.get('/features', ...adminOnly, listFeatures);
router.post('/features', ...adminOnly, createFeature);
router.patch('/features/:id', ...adminOnly, updateFeature);
router.delete('/features/:id', ...adminOnly, deactivateFeature);

router.get('/tiers', ...adminOnly, listTiersWithFeatures);
router.post('/tiers/:tierId/features/:featureId', ...adminOnly, grantTierFeature);
router.delete('/tiers/:tierId/features/:featureId', ...adminOnly, revokeTierFeature);

router.get('/license-audit', ...adminOnly, getLicenseAuditLog);

export default router;
