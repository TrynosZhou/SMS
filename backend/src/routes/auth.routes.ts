import { Router } from 'express';
import { login, register, requestPasswordReset, confirmPasswordReset, logout } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);
router.post('/logout', logout);

export default router;

