import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { createTask, getMyTasks, getStudentTasks, getTaskResponses, submitResponse } from '../controllers/elearning.controller';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/elearning');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `task-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

// Teacher endpoints
router.post('/tasks', authenticate, upload.single('file'), createTask);
router.get('/tasks/my', authenticate, getMyTasks);
router.get('/tasks/:taskId/responses', authenticate, getTaskResponses);

// Student endpoints
router.get('/tasks/student', authenticate, getStudentTasks);
router.post('/tasks/:taskId/responses', authenticate, upload.single('file'), submitResponse);

export default router;

