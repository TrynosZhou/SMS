import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { updateAccount, getAccountInfo } from '../controllers/account.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get account info (all authenticated users)
router.get('/', getAccountInfo);

// Update account (all authenticated users - teachers, parents, students)
router.put('/', updateAccount);

export default router;

