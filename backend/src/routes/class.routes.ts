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
import { linkClassToTeachers } from '../utils/teacherClassLinker';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const classRepository = AppDataSource.getRepository(Class);
    
    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    const { page: pageParam, limit: limitParam } = req.query;
    const { page, limit, skip } = resolvePaginationParams(
      pageParam as string,
      limitParam as string
    );

    // Try to load with relations, but handle errors gracefully
    let classes: Class[] = [];
    let total = 0;
    try {
      [classes, total] = await classRepository.findAndCount({
        relations: ['students', 'students.user', 'teachers', 'subjects'],
        order: { name: 'ASC' },
        skip,
        take: limit
      });
    } catch (relationError: any) {
      console.error('[getClasses] Error loading with relations:', relationError.message);
      console.error('[getClasses] Error code:', relationError.code);
      console.error('[getClasses] Error stack:', relationError.stack);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.message?.includes('column') ||
                          relationError.code === '42P01' || // PostgreSQL: relation does not exist
                          relationError.code === '42703';   // PostgreSQL: undefined column
      
      if (isTableError) {
        console.log('[getClasses] Table/relation error detected, trying fallback queries');
        // Fallback 1: load without teachers relation
        try {
          const fallbackResults = await classRepository.find({
            relations: ['students', 'students.user', 'subjects']
          });
          total = fallbackResults.length;
          classes = fallbackResults.slice(skip, skip + limit);
          // Initialize teachers array for all classes
          classes = classes.map((c: any) => ({
            ...c,
            teachers: c.teachers || []
          }));
          console.log('[getClasses] Successfully loaded classes without teachers relation');
        } catch (fallbackError1: any) {
          console.error('[getClasses] Fallback 1 failed:', fallbackError1.message);
          // Fallback 2: load without nested user relation
          try {
            const fallbackResults = await classRepository.find({
              relations: ['students', 'subjects']
            });
            total = fallbackResults.length;
            classes = fallbackResults.slice(skip, skip + limit);
            classes = classes.map((c: any) => ({
              ...c,
              teachers: c.teachers || [],
              students: (c.students || []).map((s: any) => ({
                ...s,
                user: s.user || null
              }))
            }));
            console.log('[getClasses] Successfully loaded classes without nested user relation');
          } catch (fallbackError2: any) {
            console.error('[getClasses] Fallback 2 failed:', fallbackError2.message);
            // Last resort: load without any relations
            try {
              const finalFallback = await classRepository.find();
              total = finalFallback.length;
              classes = finalFallback.slice(skip, skip + limit);
              classes = classes.map((c: any) => ({
                ...c,
                teachers: [],
                students: [],
                subjects: []
              }));
              console.log('[getClasses] Successfully loaded classes without relations');
            } catch (finalError: any) {
              console.error('[getClasses] All fallbacks failed:', finalError.message);
              // Return empty array as last resort
              classes = [];
            }
          }
        }
      } else {
        // For other errors, try fallback before rethrowing
        console.log('[getClasses] Non-table error, trying fallback before rethrowing');
        try {
          const fallbackResults = await classRepository.find({
            relations: ['subjects']
          });
          total = fallbackResults.length;
          classes = fallbackResults.slice(skip, skip + limit);
          classes = classes.map((c: any) => ({
            ...c,
            teachers: [],
            students: []
          }));
          console.log('[getClasses] Fallback successful for non-table error');
        } catch (fallbackError: any) {
          console.error('[getClasses] Fallback failed, rethrowing original error');
          throw relationError;
        }
      }
    }
    
    // Removed demo filtering - demo users can now see all students in classes
    
    // Ensure classes is always an array
    if (!Array.isArray(classes)) {
      console.warn('[getClasses] Classes is not an array, initializing as empty array');
      classes = [];
    }
    
    // Ensure all classes have required arrays initialized
    classes = classes.map((c: any) => ({
      ...c,
      teachers: Array.isArray(c.teachers) ? c.teachers : [],
      students: Array.isArray(c.students) ? c.students : [],
      subjects: Array.isArray(c.subjects) ? c.subjects : []
    }));
    
    if (!total) {
      total = await classRepository.count();
    }

    res.json(buildPaginationResponse(classes, total, page, limit));
  } catch (error: any) {
    console.error('[getClasses] Error:', error);
    console.error('[getClasses] Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const classRepository = AppDataSource.getRepository(Class);
    
    let classEntity;
    try {
      classEntity = await classRepository.findOne({
        where: { id },
        relations: ['students', 'teachers', 'subjects']
      });
    } catch (relationError: any) {
      console.error('[getClassById] Error loading with relations:', relationError.message);
      console.error('[getClassById] Error code:', relationError.code);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getClassById] Table/relation error detected, loading without teachers relation');
        // Fallback: load without teachers relation
        try {
          classEntity = await classRepository.findOne({
            where: { id },
            relations: ['students', 'subjects']
          });
          if (classEntity) {
            (classEntity as any).teachers = [];
          }
        } catch (fallbackError: any) {
          console.error('[getClassById] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          classEntity = await classRepository.findOne({
            where: { id }
          });
          if (classEntity) {
            (classEntity as any).teachers = [];
            (classEntity as any).students = [];
            (classEntity as any).subjects = [];
          }
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classEntity);
  } catch (error: any) {
    console.error('[getClassById] Error:', error);
    console.error('[getClassById] Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
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
    
    // Assign subjects if provided
    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      classEntity.subjects = subjects;
    }
    
    // Assign teachers via ManyToMany for backward compatibility
    if (teacherIds && Array.isArray(teacherIds) && teacherIds.length > 0) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teachers = await teacherRepository.find({ where: { id: In(teacherIds) } });
      classEntity.teachers = teachers;
    }
    
    // Save class
    await classRepository.save(classEntity);
    
    // Also link class to teachers using the junction table (in addition to ManyToMany)
    if (teacherIds && Array.isArray(teacherIds) && teacherIds.length > 0) {
      try {
        await linkClassToTeachers(classEntity.id, teacherIds);
        console.log('[createClass] Linked class to teachers via junction table');
      } catch (linkError: any) {
        console.error('[createClass] Error linking class to teachers via junction table:', linkError);
        // Continue - the class is saved with ManyToMany relation, junction table is optional
      }
    }
    
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

router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
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

    // Update teachers via ManyToMany for backward compatibility
    if (teacherIds !== undefined) {
      if (Array.isArray(teacherIds) && teacherIds.length > 0) {
        const teacherRepository = AppDataSource.getRepository(Teacher);
        const teachers = await teacherRepository.find({ where: { id: In(teacherIds) } });
        classEntity.teachers = teachers;
      } else {
        classEntity.teachers = [];
      }
    }

    // Save class
    await classRepository.save(classEntity);
    
    // Also link class to teachers using the junction table (in addition to ManyToMany)
    if (teacherIds !== undefined) {
      if (Array.isArray(teacherIds) && teacherIds.length > 0) {
        try {
          await linkClassToTeachers(classEntity.id, teacherIds);
          console.log('[updateClass] Linked class to teachers via junction table');
        } catch (linkError: any) {
          console.error('[updateClass] Error linking class to teachers via junction table:', linkError);
          // Continue - the class is saved with ManyToMany relation, junction table is optional
        }
      } else {
        // Empty array means remove all teacher links
        try {
          await linkClassToTeachers(classEntity.id, []);
          console.log('[updateClass] Removed all teacher links for class');
        } catch (linkError: any) {
          console.error('[updateClass] Error removing teacher links:', linkError);
        }
      }
    }
    
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

router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    
    // Validate ID
    if (!id || typeof id !== 'string' || id.trim() === '') {
      console.error('Invalid class ID provided:', id);
      return res.status(400).json({ message: 'Invalid class ID provided' });
    }
    
    // Clean the ID (remove any trailing characters that might have been added)
    const cleanId = id.trim().split(':')[0]; // Remove anything after colon if present
    
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
      console.error('Invalid UUID format for class ID:', cleanId);
      return res.status(400).json({ message: 'Invalid class ID format' });
    }
    
    console.log('Attempting to delete class with ID:', cleanId);
    
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);

    // Find the class with all relations
    const classEntity = await classRepository.findOne({
      where: { id: cleanId },
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
            classId: cleanId,
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
          t.classes?.some(c => c.id === cleanId)
        ).length;
      }
    } else {
      // For non-demo users, count all students and teachers
      studentCount = classEntity.students?.length || 0;
      teacherCount = classEntity.teachers?.length || 0;
    }
    
    // Check for exams associated with this class
    const exams = await examRepository.find({
      where: { classId: cleanId }
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
      where: { classId: cleanId }
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

