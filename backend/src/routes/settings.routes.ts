import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { UserRole } from '../entities/User';
import { 
  getSettings, 
  updateSettings, 
  getActiveTerm, 
  processOpeningDay, 
  processClosingDay, 
  getYearEndReminders,
  getUniformItems,
  createUniformItem,
  updateUniformItem,
  deleteUniformItem,
  resetSystemData
} from '../controllers/settings.controller';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), requirePermission('settings', 'edit'), updateSettings);
router.get('/active-term', getActiveTerm);
router.get('/reminders', getYearEndReminders);
router.get('/uniform-items', authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getUniformItems);
router.post('/uniform-items', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createUniformItem);
router.put('/uniform-items/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateUniformItem);
router.delete('/uniform-items/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteUniformItem);
router.post('/opening-day', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processOpeningDay);
router.post('/closing-day', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processClosingDay);
router.post('/reset-system', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), resetSystemData);

export default router;

