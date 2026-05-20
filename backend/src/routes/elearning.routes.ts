import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import {
  createTask,
  deleteTask,
  getMyTasks,
  getStudentTasks,
  getStudentTaskById,
  getTaskResponses,
  getResponseByIdForTeacher,
  markResponse,
  submitResponse,
  getStudentResponses,
  getAdminClassTasks
} from '../controllers/elearning.controller';

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

router.use(authenticate);

// Admin: tasks by class (must be before /tasks/:taskId routes)
router.get('/admin/class/:classId/tasks', getAdminClassTasks);

// Teacher endpoints
router.post('/tasks', upload.single('file'), createTask);
router.get('/tasks/my', getMyTasks);
router.delete('/tasks/:taskId', deleteTask);
router.get('/tasks/:taskId/responses', getTaskResponses);

// Student endpoints
router.get('/tasks/student', getStudentTasks);
router.get('/tasks/student/:taskId', getStudentTaskById);
router.post('/tasks/:taskId/responses', upload.single('file'), submitResponse);
router.get('/responses/student', getStudentResponses);

// Teacher marking endpoints (must be AFTER /responses/student so it doesn't match :responseId="student")
router.get('/responses/:responseId', getResponseByIdForTeacher);
router.put('/responses/:responseId/mark', upload.single('file'), markResponse);

export default router;

