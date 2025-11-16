import { Router } from 'express';
import { login, register, requestPasswordReset, confirmPasswordReset, createDemoAccount } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/create-demo', createDemoAccount); // Public endpoint to create demo account
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);

export default router;

