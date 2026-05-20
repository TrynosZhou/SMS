import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sendBulkMessage, getParentMessages, getStaffMessages, sendParentMessage, getParentOutbox, getParentOutboxById, getIncomingFromParents, markIncomingRead, markIncomingUnread, replyToIncomingMessage, sendMessageToSpecificParents, getDraftMessages, resendDraftMessage } from '../controllers/message.controller';
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

router.use(authenticate);

router.post('/bulk', upload.fields([{ name: 'attachments', maxCount: 5 }, { name: 'files', maxCount: 5 }]), sendBulkMessage);
router.post('/send', upload.array('attachments', 5), sendMessageToSpecificParents);
router.get('/parent', getParentMessages);
router.get('/staff', getStaffMessages);
router.post('/parent/send', upload.array('attachments', 5), sendParentMessage);
router.get('/parent/outbox', getParentOutbox);
router.get('/parent/outbox/:id', getParentOutboxById);
router.get('/incoming/parents', getIncomingFromParents);
router.post('/incoming/:id/read', markIncomingRead);
router.post('/incoming/:id/unread', markIncomingUnread);
router.post('/incoming/:id/reply', upload.array('attachments', 5), replyToIncomingMessage);
router.get('/drafts', getDraftMessages);
router.post('/drafts/:id/resend', resendDraftMessage);

export default router;

