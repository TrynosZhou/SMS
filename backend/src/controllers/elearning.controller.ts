import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ElearningTask, ElearningTaskType } from '../entities/ElearningTask';
import { ElearningResponse } from '../entities/ElearningResponse';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Student } from '../entities/Student';

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can create e-learning tasks' });
    }

    const { classId, studentId, type, title, description, dueDate } = req.body;
    if (!classId || !type) {
      return res.status(400).json({ message: 'classId and type are required' });
    }

    const normalizedType = (type || '').toString().toLowerCase() as keyof typeof ElearningTaskType;
    if (!ElearningTaskType[normalizedType.toUpperCase() as keyof typeof ElearningTaskType]) {
      return res.status(400).json({ message: 'Invalid task type' });
    }

    const file = req.file;
    let fileUrl: string | null = null;
    if (file) {
      fileUrl = `/uploads/elearning/${file.filename}`;
    }

    const repo = AppDataSource.getRepository(ElearningTask);
    const task = repo.create({
      classId,
      studentId: studentId || null,
      teacherId: req.user.teacher?.id || req.user.id,
      type: ElearningTaskType[normalizedType.toUpperCase() as keyof typeof ElearningTaskType],
      title: title || null,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      fileUrl
    });

    const saved = await repo.save(task);
    return res.status(201).json(saved);
  } catch (error: any) {
    console.error('Error creating e-learning task:', error);
    return res.status(500).json({ message: 'Failed to create task', error: error.message });
  }
};

export const getMyTasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can view their tasks' });
    }

    const repo = AppDataSource.getRepository(ElearningTask);
    const teacherId = req.user.teacher?.id || req.user.id;
    const tasks = await repo.find({
      where: { teacherId },
      order: { createdAt: 'DESC' }
    });
    return res.json(tasks);
  } catch (error: any) {
    console.error('Error loading teacher tasks:', error);
    return res.status(500).json({ message: 'Failed to load tasks', error: error.message });
  }
};

export const getStudentTasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Try to resolve the student associated with this user in a tolerant way.
    let student = req.user.student as Student | undefined;

    // If middleware did not attach student, try to look it up by userId or username.
    if (!student) {
      const studentRepo = AppDataSource.getRepository(Student);
      student =
        (await studentRepo.findOne({
          where: { user: { id: req.user.id } },
          relations: ['user'],
        })) ||
        (await studentRepo.findOne({
          where: { studentNumber: req.user.username },
          relations: ['user'],
        })) ||
        undefined;
    }

    if (!student) {
      console.warn('[Elearning] getStudentTasks: no student profile for user', {
        userId: req.user.id,
        role: req.user.role,
        username: req.user.username,
      });
      return res.status(403).json({ message: 'Only students can view assigned tasks' });
    }

    if (!student.classId) {
      return res.json([]);
    }

    console.log('[Elearning] getStudentTasks for user:', {
      userId: req.user.id,
      role: req.user.role,
      username: req.user.username,
      studentId: student.id,
      classId: student.classId,
    });

    const repo = AppDataSource.getRepository(ElearningTask);
    const tasks = await repo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.classEntity', 'class')
      .leftJoinAndSelect('task.teacher', 'teacher')
      .where('task.classId = :classId', { classId: student.classId })
      .andWhere('(task.studentId IS NULL OR task.studentId = :studentId)', { studentId: student.id })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return res.json(tasks);
  } catch (error: any) {
    console.error('Error loading student tasks:', error);
    return res.status(500).json({ message: 'Failed to load tasks', error: error.message });
  }
};

export const getStudentTaskById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ message: 'taskId is required' });
    }

    // Resolve student similar to getStudentTasks (tolerant of role flags).
    let student = req.user.student as Student | undefined;
    if (!student) {
      const studentRepo = AppDataSource.getRepository(Student);
      student =
        (await studentRepo.findOne({
          where: { user: { id: req.user.id } },
          relations: ['user'],
        })) ||
        (await studentRepo.findOne({
          where: { studentNumber: req.user.username },
          relations: ['user'],
        })) ||
        undefined;
    }

    if (!student) {
      return res.status(403).json({ message: 'Only students can view assigned tasks' });
    }

    const taskRepo = AppDataSource.getRepository(ElearningTask);
    const task = await taskRepo.findOne({
      where: { id: taskId },
      relations: ['classEntity', 'teacher', 'student'],
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const studentCanAccess =
      task.classId === student.classId &&
      (task.studentId === null || task.studentId === student.id);

    if (!studentCanAccess) {
      return res.status(403).json({ message: 'You are not allowed to access this task' });
    }

    return res.json(task);
  } catch (error: any) {
    console.error('Error loading student task by id:', error);
    return res.status(500).json({ message: 'Failed to load task', error: error.message });
  }
};

/** Admin / superadmin: all e-learning tasks for a class (monitoring). */
export const getAdminClassTasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const role = req.user.role;
    if (role !== UserRole.ADMIN && role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { classId } = req.params;
    if (!classId) {
      return res.status(400).json({ message: 'classId is required' });
    }

    const repo = AppDataSource.getRepository(ElearningTask);
    const tasks = await repo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.teacher', 'teacher')
      .leftJoinAndSelect('task.student', 'student')
      .where('task.classId = :classId', { classId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return res.json(tasks);
  } catch (error: any) {
    console.error('Error loading admin class tasks:', error);
    return res.status(500).json({ message: 'Failed to load tasks', error: error.message });
  }
};

export const getTaskResponses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can view responses' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ message: 'taskId is required' });
    }

    const repo = AppDataSource.getRepository(ElearningResponse);
    const responses = await repo.find({
      where: { taskId },
      order: { submittedAt: 'DESC' }
    });

    return res.json(responses);
  } catch (error: any) {
    console.error('Error loading task responses:', error);
    return res.status(500).json({ message: 'Failed to load responses', error: error.message });
  }
};

export const getResponseByIdForTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can view responses' });
    }

    const { responseId } = req.params;
    if (!responseId) {
      return res.status(400).json({ message: 'responseId is required' });
    }

    const repo = AppDataSource.getRepository(ElearningResponse);
    const response = await repo.findOne({ where: { id: responseId } });
    if (!response) {
      return res.status(404).json({ message: 'Response not found' });
    }

    // Ensure teacher owns the task
    const teacherId = req.user.teacher?.id || req.user.id;
    const taskTeacherId = response.task?.teacherId;
    if (!taskTeacherId || taskTeacherId !== teacherId) {
      return res.status(403).json({ message: 'You are not allowed to view this response' });
    }

    return res.json(response);
  } catch (error: any) {
    console.error('Error loading response by id:', error);
    return res.status(500).json({ message: 'Failed to load response', error: error.message });
  }
};

export const markResponse = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can mark responses' });
    }

    const { responseId } = req.params;
    if (!responseId) {
      return res.status(400).json({ message: 'responseId is required' });
    }

    const { score, feedbackText } = req.body;
    const file = req.file;

    const repo = AppDataSource.getRepository(ElearningResponse);
    const responseEntity = await repo.findOne({ where: { id: responseId } });
    if (!responseEntity) {
      return res.status(404).json({ message: 'Response not found' });
    }

    // Ensure teacher owns the task
    const teacherId = req.user.teacher?.id || req.user.id;
    const taskTeacherId = responseEntity.task?.teacherId;
    if (!taskTeacherId || taskTeacherId !== teacherId) {
      return res.status(403).json({ message: 'You are not allowed to mark this response' });
    }

    const parsedScore =
      score === undefined || score === null || String(score).trim() === ''
        ? null
        : Number(score);
    if (parsedScore !== null && (!Number.isFinite(parsedScore) || parsedScore < 0)) {
      return res.status(400).json({ message: 'score must be a positive number' });
    }

    if (file) {
      responseEntity.feedbackFileUrl = `/uploads/elearning/${file.filename}`;
    }
    responseEntity.feedbackText = feedbackText ? String(feedbackText) : null;
    responseEntity.score = parsedScore === null ? null : Math.round(parsedScore);
    responseEntity.markedAt = new Date();
    responseEntity.markedByTeacherId = teacherId;

    const saved = await repo.save(responseEntity);
    return res.json(saved);
  } catch (error: any) {
    console.error('Error marking response:', error);
    return res.status(500).json({ message: 'Failed to mark response', error: error.message });
  }
};

export const submitResponse = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Resolve student similar to getStudentTasks (tolerant of role flags).
    let student = req.user.student as Student | undefined;
    if (!student) {
      const studentRepo = AppDataSource.getRepository(Student);
      student =
        (await studentRepo.findOne({
          where: { user: { id: req.user.id } },
          relations: ['user'],
        })) ||
        (await studentRepo.findOne({
          where: { studentNumber: req.user.username },
          relations: ['user'],
        })) ||
        undefined;
    }

    if (!student) {
      return res.status(403).json({ message: 'Only students can submit responses' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ message: 'taskId is required' });
    }

    const { text } = req.body;
    const file = req.file;

    if (!text && !file) {
      return res.status(400).json({ message: 'Provide text or file for the response' });
    }

    let fileUrl: string | null = null;
    if (file) {
      fileUrl = `/uploads/elearning/${file.filename}`;
    }

    const repo = AppDataSource.getRepository(ElearningResponse);
    const response = repo.create({
      taskId,
      studentId: student.id,
      text: text || null,
      fileUrl
    });

    const saved = await repo.save(response);
    return res.status(201).json(saved);
  } catch (error: any) {
    console.error('Error submitting e-learning response:', error);
    return res.status(500).json({ message: 'Failed to submit response', error: error.message });
  }
};

export const getStudentResponses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Resolve student similar to getStudentTasks (tolerant of role flags).
    let student = req.user.student as Student | undefined;
    if (!student) {
      const studentRepo = AppDataSource.getRepository(Student);
      student =
        (await studentRepo.findOne({
          where: { user: { id: req.user.id } },
          relations: ['user'],
        })) ||
        (await studentRepo.findOne({
          where: { studentNumber: req.user.username },
          relations: ['user'],
        })) ||
        undefined;
    }

    if (!student) {
      console.warn('[Elearning] getStudentResponses: no student profile for user', {
        userId: req.user.id,
        role: req.user.role,
        username: req.user.username,
      });
      // To avoid breaking the student UI for edge-case accounts, return empty list.
      return res.json([]);
    }

    const markedOnly = String((req.query as any)?.marked || '').toLowerCase() === 'true';

    const repo = AppDataSource.getRepository(ElearningResponse);
    let responses = await repo.find({
      where: { studentId: student.id },
      order: { submittedAt: 'DESC' },
    });

    if (markedOnly) {
      responses = responses.filter(r => !!r.markedAt || !!r.feedbackFileUrl || !!r.feedbackText || r.score !== null);
    }

    return res.json(responses);
  } catch (error: any) {
    console.error('Error loading student responses:', error);
    return res.status(500).json({ message: 'Failed to load responses', error: error.message });
  }
};

