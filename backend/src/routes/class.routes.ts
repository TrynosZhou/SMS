import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { AppDataSource } from '../config/database';
import { Class } from '../entities/Class';
import { Exam } from '../entities/Exam';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Teacher } from '../entities/Teacher';
import { Subject } from '../entities/Subject';
import { In } from 'typeorm';
import { isDemoUser } from '../utils/demoDataFilter';
import { Student } from '../entities/Student';
import { User } from '../entities/User';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const classRepository = AppDataSource.getRepository(Class);
    
    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    // For demo users, show all classes and all students (relaxed restriction)
    const classes = await classRepository.find({
      relations: ['students', 'students.user', 'teachers', 'subjects']
    });
    
    // Removed demo filtering - demo users can now see all students in classes
    
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const classRepository = AppDataSource.getRepository(Class);
    const classEntity = await classRepository.findOne({
      where: { id },
      relations: ['students', 'teachers', 'subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classEntity);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    const { name, form, description, teacherIds, subjectIds } = req.body;
    const classRepository = AppDataSource.getRepository(Class);
    
    // Validate required fields
    if (!name || !form) {
      return res.status(400).json({ message: 'Name and form are required' });
    }

    // Check if name already exists (id is already unique as primary key)
    const existingClassByName = await classRepository.findOne({ where: { name } });
    if (existingClassByName) {
      return res.status(400).json({ 
        message: `A class with name "${name}" already exists. Please use a different name.` 
      });
    }

    const classEntity = classRepository.create({ name, form, description });
    
    // Assign teachers if provided
    if (teacherIds && Array.isArray(teacherIds) && teacherIds.length > 0) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teachers = await teacherRepository.find({ where: { id: In(teacherIds) } });
      classEntity.teachers = teachers;
    }
    
    // Assign subjects if provided
    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      classEntity.subjects = subjects;
    }
    
    await classRepository.save(classEntity);
    
    // Load the class with relations
    const savedClass = await classRepository.findOne({
      where: { id: classEntity.id },
      relations: ['students', 'teachers', 'subjects']
    });
    
    res.status(201).json({ message: 'Class created successfully', class: savedClass });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, form, description, isActive, teacherIds, subjectIds } = req.body;
    const classRepository = AppDataSource.getRepository(Class);

    const classEntity = await classRepository.findOne({ 
      where: { id },
      relations: ['teachers', 'subjects']
    });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Validate name uniqueness if being updated (id is already unique as primary key)
    if (name !== undefined && name !== classEntity.name) {
      const existingClassByName = await classRepository.findOne({ where: { name } });
      if (existingClassByName) {
        return res.status(400).json({ 
          message: `A class with name "${name}" already exists. Please use a different name.` 
        });
      }
      classEntity.name = name;
    }

    // Update fields
    if (form !== undefined) classEntity.form = form;
    if (description !== undefined) classEntity.description = description;
    if (isActive !== undefined) classEntity.isActive = isActive;

    // Update teachers if provided
    if (teacherIds !== undefined) {
      if (Array.isArray(teacherIds) && teacherIds.length > 0) {
        const teacherRepository = AppDataSource.getRepository(Teacher);
        const teachers = await teacherRepository.find({ where: { id: In(teacherIds) } });
        classEntity.teachers = teachers;
      } else {
        classEntity.teachers = [];
      }
    }
    
    // Update subjects if provided
    if (subjectIds !== undefined) {
      if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const subjectRepository = AppDataSource.getRepository(Subject);
        const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
        classEntity.subjects = subjects;
      } else {
        classEntity.subjects = [];
      }
    }

    await classRepository.save(classEntity);
    
    // Load the updated class with all relations
    const updatedClass = await classRepository.findOne({
      where: { id },
      relations: ['students', 'teachers', 'subjects']
    });
    
    res.json({ message: 'Class updated successfully', class: updatedClass });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), async (req, res) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete class with ID:', id);
    
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);

    // Find the class with all relations
    const classEntity = await classRepository.findOne({
      where: { id },
      relations: ['students', 'teachers', 'subjects']
    });

    if (!classEntity) {
      console.log('Class not found with ID:', id);
      return res.status(404).json({ message: 'Class not found' });
    }

    console.log('Found class:', classEntity.name);
    console.log('Students count:', classEntity.students?.length || 0);
    console.log('Teachers count:', classEntity.teachers?.length || 0);

    // Check for associated records
    // For demo users, only count demo students/teachers
    let studentCount = 0;
    let teacherCount = 0;
    
    if (isDemoUser(req)) {
      // For demo users, only count demo students and teachers
      if (classEntity.students) {
        const studentRepository = AppDataSource.getRepository(Student);
        const demoStudents = await studentRepository.find({
          where: { 
            classId: id,
            user: { isDemo: true }
          },
          relations: ['user']
        });
        studentCount = demoStudents.length;
      }
      
      // Count only demo teachers
      if (classEntity.teachers) {
        const teacherRepository = AppDataSource.getRepository(Teacher);
        const demoTeachers = await teacherRepository.find({
          where: {
            user: { isDemo: true }
          },
          relations: ['user', 'classes']
        });
        // Filter to only teachers assigned to this class
        teacherCount = demoTeachers.filter(t => 
          t.classes?.some(c => c.id === id)
        ).length;
      }
    } else {
      // For non-demo users, count all students and teachers
      studentCount = classEntity.students?.length || 0;
      teacherCount = classEntity.teachers?.length || 0;
    }
    
    // Check for exams associated with this class
    const exams = await examRepository.find({
      where: { classId: id }
    });
    const examCount = exams.length;
    console.log('Exams count:', examCount);
    console.log('Filtered student count:', studentCount);
    console.log('Filtered teacher count:', teacherCount);

    // Prevent deletion if there are associated records
    if (studentCount > 0 || teacherCount > 0 || examCount > 0) {
      console.log('Cannot delete class - has associated records');
      return res.status(400).json({
        message: 'Cannot delete class with associated records',
        details: {
          students: studentCount,
          teachers: teacherCount,
          exams: examCount
        }
      });
    }

    // Delete all report card remarks associated with this class
    const remarks = await remarksRepository.find({
      where: { classId: id }
    });
    
    if (remarks.length > 0) {
      console.log(`Deleting ${remarks.length} report card remarks associated with class`);
      await remarksRepository.remove(remarks);
    }

    // Remove associations with subjects (ManyToMany)
    if (classEntity.subjects && classEntity.subjects.length > 0) {
      console.log('Removing subject associations');
      classEntity.subjects = [];
      await classRepository.save(classEntity);
    }

    // Delete the class
    console.log('Deleting class:', classEntity.name);
    await classRepository.remove(classEntity);
    console.log('Class deleted successfully');
    res.json({ message: 'Class deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting class:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

