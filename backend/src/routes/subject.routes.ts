import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { AppDataSource } from '../config/database';
import { Subject } from '../entities/Subject';
import { isDemoUser } from '../utils/demoDataFilter';
import { Teacher } from '../entities/Teacher';
import { In } from 'typeorm';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const subjectRepository = AppDataSource.getRepository(Subject);
    
    // Filter subjects for demo users - only show subjects assigned to demo teachers
    if (isDemoUser(req)) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const demoTeachers = await teacherRepository.find({
        where: { user: { isDemo: true } },
        relations: ['subjects', 'user']
      });
      const demoSubjectIds = [...new Set(demoTeachers.flatMap(t => t.subjects?.map(s => s.id) || []).filter(Boolean))];
      
      if (demoSubjectIds.length > 0) {
        const subjects = await subjectRepository.find({
          where: { id: In(demoSubjectIds) },
          relations: ['teachers', 'classes']
        });
        // Filter teachers to only show demo teachers
        subjects.forEach(subj => {
          if (subj.teachers) {
            subj.teachers = subj.teachers.filter((t: any) => t.user?.isDemo === true);
          }
        });
        return res.json(subjects);
      } else {
        return res.json([]);
      }
    }
    
    const subjects = await subjectRepository.find({
      relations: ['teachers', 'classes']
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const subjectRepository = AppDataSource.getRepository(Subject);
    const subject = await subjectRepository.findOne({
      where: { id },
      relations: ['teachers', 'classes']
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const subjectRepository = AppDataSource.getRepository(Subject);
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Subject name is required' });
    }

    if (!code) {
      return res.status(400).json({ message: 'Subject code is required and must be unique' });
    }

    // Check if code is unique
    const existingSubject = await subjectRepository.findOne({ where: { code: code.trim() } });
    if (existingSubject) {
      return res.status(400).json({ message: 'Subject code already exists' });
    }

    const subject = subjectRepository.create({ name: name.trim(), code: code.trim(), description });
    await subjectRepository.save(subject);
    res.status(201).json({ message: 'Subject created successfully', subject });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Subject code must be unique' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, isActive } = req.body;
    const subjectRepository = AppDataSource.getRepository(Subject);

    const subject = await subjectRepository.findOne({ where: { id } });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Check if code is being changed and validate uniqueness
    if (code !== undefined) {
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== subject.code) {
        // Check if the new code already exists (excluding current subject)
        const existingSubject = await subjectRepository.findOne({ 
          where: { code: normalizedCode },
          relations: []
        });
        if (existingSubject && existingSubject.id !== id) {
          return res.status(400).json({ message: 'Subject code already exists' });
        }
        subject.code = normalizedCode;
      }
    }

    // Update fields
    if (name !== undefined) subject.name = name;
    if (description !== undefined) subject.description = description;
    if (isActive !== undefined) subject.isActive = isActive;

    await subjectRepository.save(subject);
    res.json({ message: 'Subject updated successfully', subject });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Subject code must be unique' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const subjectRepository = AppDataSource.getRepository(Subject);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    const subject = await subjectRepository.findOne({
      where: { id },
      relations: ['teachers', 'classes']
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Check if subject has associated teachers or classes
    const teacherCount = subject.teachers?.length || 0;
    const classCount = subject.classes?.length || 0;

    if (teacherCount > 0 || classCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete subject with associated records',
        details: {
          teachers: teacherCount,
          classes: classCount
        }
      });
    }

    // Delete the subject
    await subjectRepository.remove(subject);
    res.json({ message: 'Subject deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

