import { Router } from 'express';
import { login, register, requestPasswordReset, confirmPasswordReset } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);

export default router;

