import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getPromotionRules,
  getPromotionRule,
  createPromotionRule,
  updatePromotionRule,
  deletePromotionRule,
  getActivePromotionRules
} from '../controllers/promotion-rule.controller';

const router = Router();

router.use(authenticate);

// Get all promotion rules
router.get('/', getPromotionRules);

// Get active promotion rules (for promotion process)
router.get('/active', getActivePromotionRules);

// Get a single promotion rule
router.get('/:id', getPromotionRule);

// Create a new promotion rule
router.post('/', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), createPromotionRule);

// Update a promotion rule
router.put('/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), updatePromotionRule);

// Delete a promotion rule
router.delete('/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), deletePromotionRule);

export default router;

