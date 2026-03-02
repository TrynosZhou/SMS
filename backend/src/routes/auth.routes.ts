import { Router } from 'express';
import { login, register, requestPasswordReset, confirmPasswordReset, logout, verifyForgotPasswordDetails, setForgotPasswordNewPassword } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);
router.post('/forgot-password/verify', verifyForgotPasswordDetails);
router.post('/forgot-password/set', setForgotPasswordNewPassword);
router.post('/logout', logout);

export default router;

