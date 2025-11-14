import { Router } from 'express';
import { sendBulkMessage, getParentMessages } from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/bulk', authenticate, sendBulkMessage);
router.get('/parent', authenticate, getParentMessages);

export default router;

