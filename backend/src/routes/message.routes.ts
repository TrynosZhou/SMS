import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sendBulkMessage, getParentMessages, getStaffMessages, sendParentMessage, getParentOutbox, getParentOutboxById, getIncomingFromParents, markIncomingRead, markIncomingUnread, replyToIncomingMessage, sendMessageToSpecificParents } from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Multer storage for parent message attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join(process.cwd(), 'uploads', 'parent-messages');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/bulk', authenticate, sendBulkMessage);
router.post('/send', authenticate, upload.array('attachments', 5), sendMessageToSpecificParents);
router.get('/parent', authenticate, getParentMessages);
router.get('/staff', authenticate, getStaffMessages);
router.post('/parent/send', authenticate, upload.array('attachments', 5), sendParentMessage);
router.get('/parent/outbox', authenticate, getParentOutbox);
router.get('/parent/outbox/:id', authenticate, getParentOutboxById);
router.get('/incoming/parents', authenticate, getIncomingFromParents);
router.post('/incoming/:id/read', authenticate, markIncomingRead);
router.post('/incoming/:id/unread', authenticate, markIncomingUnread);
router.post('/incoming/:id/reply', authenticate, upload.array('attachments', 5), replyToIncomingMessage);

export default router;

