import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { createSchool, generateSchoolCode, getCurrentSchoolProfile, listSchools, updateSchool } from '../controllers/school.controller';

const router = Router();

router.get('/profile', authenticate, getCurrentSchoolProfile);
router.get('/', authenticate, authorize(UserRole.SUPERADMIN), listSchools);
router.post('/', authenticate, authorize(UserRole.SUPERADMIN), createSchool);
router.patch('/:id', authenticate, authorize(UserRole.SUPERADMIN), updateSchool);
// Generate code endpoint removed - school codes are now human-readable and set via Settings page

export default router;


