import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyLicenseAccess } from '../controllers/license.controller';

const router = Router();

router.get('/me', authenticate, getMyLicenseAccess);

export default router;
