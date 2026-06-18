import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  sendBulkMessage,
  getParentMessages,
  getStaffMessages,
  sendParentMessage,
  getParentOutbox,
  getParentOutboxById,
  getIncomingFromParents,
  getIncomingFromParentsUnreadCount,
  markIncomingRead,
  markIncomingUnread,
  replyToIncomingMessage,
  sendMessageToSpecificParents,
  getDraftMessages,
  resendDraftMessage,
  listParentRecipients,
} from '../controllers/message.controller';
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

/** Only run multer when the client sends multipart/form-data (avoids hanging JSON requests). */
function optionalMultipartFields(
  fields: { name: string; maxCount: number }[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('multipart/form-data')) {
      return upload.fields(fields)(req, res, next);
    }
    return next();
  };
}

function optionalMultipartArray(
  fieldName: string,
  maxCount: number
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('multipart/form-data')) {
      return upload.array(fieldName, maxCount)(req, res, next);
    }
    return next();
  };
}

router.use(authenticate);

router.get('/parents/recipients', listParentRecipients);
router.post(
  '/bulk',
  optionalMultipartFields([
    { name: 'attachments', maxCount: 5 },
    { name: 'files', maxCount: 5 },
  ]),
  sendBulkMessage
);
router.post('/send', optionalMultipartArray('attachments', 5), sendMessageToSpecificParents);
router.get('/parent', getParentMessages);
router.get('/staff', getStaffMessages);
router.post('/parent/send', optionalMultipartArray('attachments', 5), sendParentMessage);
router.get('/parent/outbox', getParentOutbox);
router.get('/parent/outbox/:id', getParentOutboxById);
router.get('/incoming/parents/unread-count', getIncomingFromParentsUnreadCount);
router.get('/incoming/parents', getIncomingFromParents);
router.post('/incoming/:id/read', markIncomingRead);
router.post('/incoming/:id/unread', markIncomingUnread);
router.post('/incoming/:id/reply', optionalMultipartArray('attachments', 5), replyToIncomingMessage);
router.get('/drafts', getDraftMessages);
router.post('/drafts/:id/resend', resendDraftMessage);

export default router;
