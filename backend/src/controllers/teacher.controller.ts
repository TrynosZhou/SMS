import { Response } from 'express';
import { In } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';
import { generateTeacherId } from '../utils/teacherIdGenerator';
import { isDemoUser } from '../utils/demoDataFilter';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { linkTeacherToClasses, syncManyToManyToJunctionTable } from '../utils/teacherClassLinker';
import { calculateAge } from '../utils/ageUtils';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';
import { validatePhoneNumber } from '../utils/phoneValidator';

export const registerTeacher = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    // Generate unique teacher ID with prefix JPST
    const teacherId = await generateTeacherId();

    // Parse dateOfBirth if it's a string
    let parsedDateOfBirth: Date | null = null;
    if (dateOfBirth) {
      if (typeof dateOfBirth === 'string') {
        parsedDateOfBirth = new Date(dateOfBirth);
        if (isNaN(parsedDateOfBirth.getTime())) {
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else {
        parsedDateOfBirth = dateOfBirth;
      }
    }

    if (!parsedDateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required to register a teacher' });
    }

    const teacherAge = calculateAge(parsedDateOfBirth);
    if (teacherAge < 20 || teacherAge > 65) {
      return res.status(400).json({ message: 'Teacher age must be between 20 and 65 years' });
    }

    // Validate phone number if provided
    let normalizedPhoneNumber: string | null = null;
    if (phoneNumber && phoneNumber.trim()) {
      const phoneValidation = validatePhoneNumber(phoneNumber, false);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
      }
      normalizedPhoneNumber = phoneValidation.normalized || phoneNumber.trim();
    }

    const teacherData: Partial<Teacher> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      teacherId,
      phoneNumber: normalizedPhoneNumber,
      address: address?.trim() || null
    };

    // Only include dateOfBirth if it's provided
    teacherData.dateOfBirth = parsedDateOfBirth;

    const teacher = teacherRepository.create(teacherData) as Teacher;

    if (subjectIds) {
      const { Subject } = await import('../entities/Subject');
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      teacher.subjects = subjects;
    }

    // Set classes via ManyToMany for backward compatibility
    if (classIds && Array.isArray(classIds) && classIds.length > 0) {
      const { Class } = await import('../entities/Class');
      const classRepository = AppDataSource.getRepository(Class);
      const classes = await classRepository.find({ where: { id: In(classIds) } });
      teacher.classes = classes;
    }

    // Save teacher
    await teacherRepository.save(teacher);
    
    // Create temporary user account for teacher (username is TeacherID, password only, no email)
    const tempUsername = teacherId; // Username is the TeacherID
    const tempPassword = `temp_${teacherId}_${Date.now()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Check if the current user is a demo user
    const isDemo = req.user?.isDemo === true || 
                   req.user?.email === 'demo@school.com' || 
                   req.user?.username === 'demo@school.com';
    
    const user = userRepository.create({
      email: null, // Teachers don't require email
      username: tempUsername,
      password: hashedPassword,
      role: UserRole.TEACHER,
      mustChangePassword: true,
      isTemporaryAccount: true,
      isDemo: isDemo // Set isDemo flag based on creator
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);

    // Also link teacher to classes using the junction table (in addition to ManyToMany)
    if (classIds && Array.isArray(classIds) && classIds.length > 0) {
      try {
        await linkTeacherToClasses(teacher.id, classIds);
        console.log('[registerTeacher] Linked teacher to classes via junction table');
      } catch (linkError: any) {
        console.error('[registerTeacher] Error linking teacher to classes via junction table:', linkError);
        // Continue - the teacher is saved with ManyToMany relation, junction table is optional
      }
    }
    
    // Load the teacher with relations
    const savedTeacher = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['subjects', 'classes']
    });

    res.status(201).json({ 
      message: 'Teacher registered successfully with temporary account', 
      teacher: savedTeacher,
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        note: 'Teacher must change password on first login. Login with username and password only.'
      }
    });
  } catch (error: any) {
    console.error('Error registering teacher:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Employee number already exists' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTeachers = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const { page: pageParam, limit: limitParam } = req.query;
    const { page, limit, skip } = resolvePaginationParams(
      pageParam as string,
      limitParam as string
    );
    
    // Try to load with relations, but handle errors gracefully
    let teachers: Teacher[] = [];
    let total = 0;
    try {
      const queryBuilder = teacherRepository
        .createQueryBuilder('teacher')
        .leftJoinAndSelect('teacher.subjects', 'subjects')
        .leftJoinAndSelect('teacher.classes', 'classes')
        .leftJoinAndSelect('teacher.user', 'user');
      
      [teachers, total] = await queryBuilder
        .orderBy('teacher.lastName', 'ASC')
        .addOrderBy('teacher.firstName', 'ASC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();
    } catch (relationError: any) {
      console.error('[getTeachers] Error loading with relations:', relationError.message);
      console.error('[getTeachers] Error code:', relationError.code);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getTeachers] Table/relation error detected, loading without classes relation');
        // Fallback: load without classes relation
        try {
          const queryBuilder = teacherRepository
            .createQueryBuilder('teacher')
            .leftJoinAndSelect('teacher.subjects', 'subjects')
            .leftJoinAndSelect('teacher.user', 'user');
          
          const fallbackResults = await queryBuilder.getMany();
          total = fallbackResults.length;
          teachers = fallbackResults.slice(skip, skip + limit);
          
          // Initialize classes array for all teachers
          teachers = teachers.map((t: any) => ({
            ...t,
            classes: t.classes || []
          }));
        } catch (fallbackError: any) {
          console.error('[getTeachers] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          const finalFallback = await teacherRepository.find();
          total = finalFallback.length;
          teachers = finalFallback.slice(skip, skip + limit).map((t: any) => ({
            ...t,
            classes: [],
            subjects: t.subjects || []
          }));
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    res.json(buildPaginationResponse(teachers, total, page, limit));
  } catch (error: any) {
    console.error('[getTeachers] Error:', error);
    console.error('[getTeachers] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getCurrentTeacher = async (req: AuthRequest, res: Response) => {
  console.log('[getCurrentTeacher] ========== ENDPOINT CALLED ==========');
  console.log('[getCurrentTeacher] Request URL:', req.url);
  console.log('[getCurrentTeacher] Request Method:', req.method);
  
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userEmail = req.user?.email;
    
    console.log('[getCurrentTeacher] ============ DEBUG INFO ============');
    console.log('[getCurrentTeacher] User ID:', userId);
    console.log('[getCurrentTeacher] User Role:', userRole);
    console.log('[getCurrentTeacher] User Email:', userEmail);
    
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (userRole !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can access this endpoint' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);
    
    try {
      // Try to find teacher by userId
      let teacher = await teacherRepository.findOne({
        where: { userId },
        relations: ['subjects', 'classes', 'user']
      });

      console.log('[getCurrentTeacher] Teacher found by userId:', teacher ? 'Yes' : 'No');
      
      if (!teacher) {
        console.log('[getCurrentTeacher] No teacher found for userId:', userId);
        
        // Try to find teacher by user email pattern (diagnostic)
        const allTeachers = await teacherRepository.find();
        console.log('[getCurrentTeacher] Total teachers in DB:', allTeachers.length);
        console.log('[getCurrentTeacher] Teachers without userId:', allTeachers.filter(t => !t.userId).length);
        
        // Check if user has teacher relationship from User side
        const userWithTeacher = await userRepository.findOne({
          where: { id: userId },
          relations: ['teacher']
        });
        
        console.log('[getCurrentTeacher] User.teacher exists:', !!userWithTeacher?.teacher);
        
        if (userWithTeacher?.teacher) {
          // User has teacher relationship, but teacher.userId might not be set
          console.log('[getCurrentTeacher] Found teacher via User relationship:', userWithTeacher.teacher.id);
          teacher = await teacherRepository.findOne({
            where: { id: userWithTeacher.teacher.id },
            relations: ['subjects', 'classes', 'user']
          });
          
          // Fix the userId if it's not set
          if (teacher && !teacher.userId) {
            console.log('[getCurrentTeacher] Auto-fixing teacher.userId...');
            teacher.userId = userId;
            await teacherRepository.save(teacher);
            console.log('[getCurrentTeacher] Teacher.userId fixed!');
          }
        }
        
        if (!teacher) {
          return res.status(404).json({ 
            message: 'Teacher profile not found. Please contact administrator.',
            debug: {
              userId,
              userEmail,
              totalTeachers: allTeachers.length,
              teachersWithoutUserId: allTeachers.filter(t => !t.userId).length,
              suggestion: 'Run: UPDATE teachers SET "userId" = \'' + userId + '\' WHERE "teacherId" = \'YOUR_TEACHER_ID\';'
            }
          });
        }
      }

      console.log('[getCurrentTeacher] Teacher ID (UUID):', teacher.id);
      console.log('[getCurrentTeacher] Teacher ID (string):', teacher.teacherId);
      console.log('[getCurrentTeacher] Teacher Name:', teacher.firstName, teacher.lastName);
      console.log('[getCurrentTeacher] Teacher Full Name:', `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim());
      console.log('[getCurrentTeacher] Classes count (from initial load):', teacher.classes?.length || 0);
      
      // Ensure classes array is initialized
      if (!teacher.classes) {
        teacher.classes = [];
      }
      
      // Reset classes to ensure we fetch fresh data from junction table
      teacher.classes = [];
      
      // Always fetch classes from junction table (primary method)
      try {
        console.log('[getCurrentTeacher] Fetching classes for teacher ID (UUID):', teacher.id, 'TeacherID (string):', teacher.teacherId);
        
        const { TeacherClass } = await import('../entities/TeacherClass');
        const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
        
        // Query the junction table using teacher.id (UUID) and filter for active classes only
        const teacherClasses = await teacherClassRepository
          .createQueryBuilder('tc')
          .innerJoinAndSelect('tc.class', 'class')
          .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
          .andWhere('class.isActive = :isActive', { isActive: true })
          .getMany();
        
        console.log('[getCurrentTeacher] Found', teacherClasses.length, 'active class assignments in junction table');
        
        if (teacherClasses.length > 0) {
          // Extract class entities from junction table (already filtered for active)
          const classes = teacherClasses.map(tc => tc.class);
          teacher.classes = classes;
          console.log('[getCurrentTeacher] Classes loaded from junction table:', classes.map(c => c.name).join(', '));
        } else {
          // Fallback: try ManyToMany relation if junction table has no results
          console.log('[getCurrentTeacher] No classes in junction table, trying ManyToMany relation...');
          try {
            // Reload teacher with ManyToMany relation
            const teacherWithClasses = await teacherRepository.findOne({
              where: { id: teacher.id },
              relations: ['classes']
            });
            
            if (teacherWithClasses && teacherWithClasses.classes && teacherWithClasses.classes.length > 0) {
              // Filter for active classes only
              teacher.classes = teacherWithClasses.classes.filter((c: any) => c.isActive === true);
              console.log('[getCurrentTeacher] Active classes found via ManyToMany:', teacher.classes.map((c: any) => c.name).join(', '));
              
              // Sync to junction table for future queries
              try {
                const classIds = teacher.classes.map((c: any) => c.id);
                await linkTeacherToClasses(teacher.id, classIds);
                console.log('[getCurrentTeacher] Synced classes to junction table');
              } catch (syncError: any) {
                console.error('[getCurrentTeacher] Error syncing to junction table:', syncError.message);
              }
            } else {
              // Try query builder approach
              const { Class } = await import('../entities/Class');
              const classRepository = AppDataSource.getRepository(Class);
              
              const classesWithTeacher = await classRepository
                .createQueryBuilder('class')
                .leftJoinAndSelect('class.teachers', 'teacher')
                .where('teacher.id = :teacherId', { teacherId: teacher.id })
                .andWhere('class.isActive = :isActive', { isActive: true })
                .getMany();
              
              if (classesWithTeacher.length > 0) {
                teacher.classes = classesWithTeacher;
                console.log('[getCurrentTeacher] Active classes found via query builder:', classesWithTeacher.map(c => c.name).join(', '));
                
                // Sync to junction table for future queries
                try {
                  const classIds = classesWithTeacher.map(c => c.id);
                  await linkTeacherToClasses(teacher.id, classIds);
                  console.log('[getCurrentTeacher] Synced classes to junction table');
                } catch (syncError: any) {
                  console.error('[getCurrentTeacher] Error syncing to junction table:', syncError.message);
                }
              } else {
                teacher.classes = [];
                console.log('[getCurrentTeacher] No classes found via any method');
              }
            }
          } catch (fallbackError: any) {
            console.error('[getCurrentTeacher] Error in fallback class query:', fallbackError.message);
            teacher.classes = [];
          }
        }
      } catch (junctionError: any) {
        console.error('[getCurrentTeacher] Error loading classes from junction table:', junctionError.message);
        console.error('[getCurrentTeacher] Junction table error stack:', junctionError.stack);
        // Try fallback
        try {
          const teacherWithClasses = await teacherRepository.findOne({
            where: { id: teacher.id },
            relations: ['classes']
          });
          if (teacherWithClasses && teacherWithClasses.classes) {
            teacher.classes = teacherWithClasses.classes;
          } else {
            teacher.classes = [];
          }
        } catch (fallbackError: any) {
          teacher.classes = [];
        }
      }
      
      console.log('[getCurrentTeacher] Final classes count:', teacher.classes?.length || 0);
      
      console.log('[getCurrentTeacher] Final classes count:', teacher.classes?.length || 0);
      console.log('[getCurrentTeacher] Final teacher name:', `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim());
      console.log('[getCurrentTeacher] =====================================');
      
      // Ensure arrays are always present
      if (!teacher.classes) {
        teacher.classes = [];
      }
      if (!teacher.subjects) {
        teacher.subjects = [];
      }
      
      // Add fullName property in LastName + FirstName format
      const teacherResponse: any = {
        ...teacher,
        fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher'
      };
      
      res.json(teacherResponse);
    } catch (dbError: any) {
      console.error('[getCurrentTeacher] Database error:', dbError);
      throw dbError;
    }
  } catch (error: any) {
    console.error('[getCurrentTeacher] Error:', error);
    console.error('[getCurrentTeacher] Stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTeacherById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    
    // Try to load with relations, but handle errors gracefully
    let teacher;
    try {
      teacher = await teacherRepository.findOne({
        where: { id },
        relations: ['subjects', 'classes', 'user']
      });
    } catch (relationError: any) {
      console.error('[getTeacherById] Error loading with relations:', relationError.message);
      console.error('[getTeacherById] Error code:', relationError.code);
      console.error('[getTeacherById] Error stack:', relationError.stack);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getTeacherById] Table/relation error detected, loading without classes relation');
        // Fallback: load without classes relation
        try {
          teacher = await teacherRepository.findOne({
            where: { id },
            relations: ['subjects', 'user']
          });
          if (teacher) {
            (teacher as any).classes = [];
          }
        } catch (fallbackError: any) {
          console.error('[getTeacherById] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          teacher = await teacherRepository.findOne({
            where: { id }
          });
          if (teacher) {
            (teacher as any).classes = [];
            (teacher as any).subjects = [];
          }
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Ensure arrays are initialized
    if (!teacher.classes) {
      (teacher as any).classes = [];
    }
    if (!teacher.subjects) {
      (teacher as any).subjects = [];
    }

    res.json(teacher);
  } catch (error: any) {
    console.error('[getTeacherById] Error:', error);
    console.error('[getTeacherById] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const updateTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds } = req.body;
    
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (firstName) teacher.firstName = firstName.trim();
    if (lastName) teacher.lastName = lastName.trim();
    
    // Update and validate phone number
    if (phoneNumber !== undefined) {
      if (phoneNumber && phoneNumber.trim()) {
        const phoneValidation = validatePhoneNumber(phoneNumber, false);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
        }
        teacher.phoneNumber = phoneValidation.normalized || phoneNumber.trim();
      } else {
        teacher.phoneNumber = null;
      }
    }
    
    if (address !== undefined) teacher.address = address?.trim() || null;
    if (dateOfBirth) {
      const parsedDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
      if (!isNaN(parsedDate.getTime())) {
        teacher.dateOfBirth = parsedDate;
      }
    }

    if (subjectIds) {
      const { Subject } = await import('../entities/Subject');
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      teacher.subjects = subjects;
    }

    // Set classes via ManyToMany for backward compatibility
    if (classIds !== undefined) {
      if (Array.isArray(classIds) && classIds.length > 0) {
        const { Class } = await import('../entities/Class');
        const classRepository = AppDataSource.getRepository(Class);
        const classes = await classRepository.find({ where: { id: In(classIds) } });
        teacher.classes = classes;
      } else {
        teacher.classes = [];
      }
    }

    // Save teacher
    await teacherRepository.save(teacher);

    // Also link teacher to classes using the junction table (in addition to ManyToMany)
    if (classIds !== undefined) {
      if (Array.isArray(classIds) && classIds.length > 0) {
        try {
          await linkTeacherToClasses(teacher.id, classIds);
          console.log('[updateTeacher] Linked teacher to classes via junction table');
        } catch (linkError: any) {
          console.error('[updateTeacher] Error linking teacher to classes via junction table:', linkError);
          // Continue - the teacher is saved with ManyToMany relation, junction table is optional
        }
      } else {
        // Empty array means remove all class links
        try {
          await linkTeacherToClasses(teacher.id, []);
          console.log('[updateTeacher] Removed all class links for teacher');
        } catch (linkError: any) {
          console.error('[updateTeacher] Error removing class links:', linkError);
        }
      }
    }

    const updatedTeacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes']
    });

    res.json({ message: 'Teacher updated successfully', teacher: updatedTeacher });
  } catch (error: any) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete teacher with ID:', id);

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['user', 'subjects', 'classes']
    });

    if (!teacher) {
      console.log('Teacher not found with ID:', id);
      return res.status(404).json({ message: 'Teacher not found' });
    }

    console.log('Found teacher:', teacher.firstName, teacher.lastName, `(${teacher.teacherId})`);

    // Check if teacher has associated classes or subjects
    const classCount = teacher.classes?.length || 0;
    const subjectCount = teacher.subjects?.length || 0;

    if (classCount > 0 || subjectCount > 0) {
      // Remove associations instead of preventing deletion
      teacher.classes = [];
      teacher.subjects = [];
      await teacherRepository.save(teacher);
    }

    // Delete associated user account if it exists
    if (teacher.userId) {
      const user = await userRepository.findOne({ where: { id: teacher.userId } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

    // Delete the teacher
    console.log('Deleting teacher:', teacher.firstName, teacher.lastName);
    await teacherRepository.remove(teacher);
    console.log('Teacher deleted successfully');

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting teacher:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    let teacher: Teacher | null = null;
    let teacherId: string | null = null;

    // Get teacherId from params or from authenticated user
    const paramId = req.params.teacherId || req.params.id;
    
    // If no teacherId in params, try to get from authenticated user
    if (!paramId && req.user) {
      const user = req.user;
      
      // If user is a teacher, get their teacher profile
      if (user.role === UserRole.TEACHER) {
        // Try to find by userId first
        teacher = await teacherRepository.findOne({
          where: { userId: user.id }
        });
        
        // If not found by userId, try by teacherId (username)
        if (!teacher && user.username) {
          teacher = await teacherRepository.findOne({
            where: { teacherId: user.username }
          });
        }
        
        if (teacher) {
          teacherId = teacher.id;
        }
      } else if (user.teacher) {
        teacherId = user.teacher.id;
      }
    } else if (paramId) {
      // Check if paramId is a UUID (teacher.id) or string (teacher.teacherId)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (uuidRegex.test(paramId)) {
        // It's a UUID, find by id
        teacher = await teacherRepository.findOne({
          where: { id: paramId }
        });
        teacherId = paramId;
      } else {
        // It's likely a teacherId string, find by teacherId
        teacher = await teacherRepository.findOne({
          where: { teacherId: paramId }
        });
        if (teacher) {
          teacherId = teacher.id;
        }
      }
    }

    if (!teacherId || !teacher) {
      return res.status(400).json({ message: 'Teacher ID is required or teacher not found' });
    }

    console.log('[getTeacherClasses] Fetching classes for teacher:', {
      id: teacher.id,
      teacherId: teacher.teacherId,
      name: `${teacher.firstName} ${teacher.lastName}`
    });

    // Use the junction table to fetch classes (primary method)
    const { TeacherClass } = await import('../entities/TeacherClass');
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    // Query the junction table using teacher.id (UUID) and filter for active classes only
    const teacherClasses = await teacherClassRepository
      .createQueryBuilder('tc')
      .innerJoinAndSelect('tc.class', 'class')
      .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
      .andWhere('class.isActive = :isActive', { isActive: true })
      .getMany();

    console.log('[getTeacherClasses] Found', teacherClasses.length, 'active class assignments in junction table');

    let classes: any[] = [];

    if (teacherClasses.length > 0) {
      // Extract class information from junction table
      classes = teacherClasses.map(tc => ({
        id: tc.class.id,
        name: tc.class.name,
        form: tc.class.form,
        description: tc.class.description,
        isActive: tc.class.isActive
      }));
      console.log('[getTeacherClasses] Classes loaded from junction table:', classes.map(c => c.name).join(', '));
    } else {
      // Fallback: try ManyToMany relation if junction table has no results
      console.log('[getTeacherClasses] No classes in junction table, trying ManyToMany relation...');
      const teacherWithClasses = await teacherRepository.findOne({
        where: { id: teacher.id },
        relations: ['classes']
      });

      if (teacherWithClasses && teacherWithClasses.classes && teacherWithClasses.classes.length > 0) {
        // Filter for active classes only
        classes = teacherWithClasses.classes
          .filter((c: any) => c.isActive === true)
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            form: c.form,
            description: c.description,
            isActive: c.isActive
          }));
        console.log('[getTeacherClasses] Found', classes.length, 'active classes via ManyToMany relation:', classes.map(c => c.name).join(', '));
        
        // Sync to junction table for future queries
        try {
          const { linkTeacherToClasses } = await import('../utils/teacherClassLinker');
          const classIds = classes.map(c => c.id);
          await linkTeacherToClasses(teacher.id, classIds);
          console.log('[getTeacherClasses] Synced classes to junction table');
        } catch (syncError: any) {
          console.error('[getTeacherClasses] Error syncing to junction table:', syncError.message);
        }
      } else {
        console.log('[getTeacherClasses] No classes found via any method');
      }
    }

    res.json({ classes });
  } catch (error: any) {
    console.error('[getTeacherClasses] Error fetching teacher classes:', error);
    console.error('[getTeacherClasses] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Sync all ManyToMany relationships to junction table
export const syncTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    console.log('[syncTeacherClasses] Starting sync of all teacher-class relationships...');
    
    await syncManyToManyToJunctionTable();
    
    res.json({ 
      message: 'Successfully synced all teacher-class relationships to junction table',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[syncTeacherClasses] Error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Diagnostic endpoint to check teacher-class relationships
export const diagnoseTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { teacherId } = req.params; // Can be UUID or TeacherID string
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const { Class } = await import('../entities/Class');
    const classRepository = AppDataSource.getRepository(Class);
    const { TeacherClass } = await import('../entities/TeacherClass');
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    // Find teacher
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let teacher: Teacher | null = null;
    
    if (uuidRegex.test(teacherId)) {
      teacher = await teacherRepository.findOne({ where: { id: teacherId } });
    } else {
      teacher = await teacherRepository.findOne({ where: { teacherId: teacherId } });
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check junction table
    const junctionTableClasses = await teacherClassRepository.find({
      where: { teacherId: teacher.id },
      relations: ['class']
    });

    // Check ManyToMany relation
    const teacherWithClasses = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['classes']
    });

    // Check reverse relationship (classes that have this teacher)
    const allClasses = await classRepository.find({
      relations: ['teachers']
    });
    const classesWithThisTeacher = allClasses.filter(c => 
      c.teachers?.some((t: any) => t.id === teacher!.id)
    );

    res.json({
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        fullName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
      },
      junctionTable: {
        count: junctionTableClasses.length,
        classes: junctionTableClasses.map(tc => ({
          id: tc.class.id,
          name: tc.class.name
        }))
      },
      manyToMany: {
        count: teacherWithClasses?.classes?.length || 0,
        classes: teacherWithClasses?.classes?.map((c: any) => ({
          id: c.id,
          name: c.name
        })) || []
      },
      reverseRelationship: {
        count: classesWithThisTeacher.length,
        classes: classesWithThisTeacher.map(c => ({
          id: c.id,
          name: c.name
        }))
      },
      recommendation: junctionTableClasses.length === 0 && 
                       (teacherWithClasses?.classes?.length || 0) === 0 && 
                       classesWithThisTeacher.length === 0
        ? 'This teacher has no classes assigned. Assign classes through: Teachers > Edit Teacher > Select Classes, or Classes > Edit Class > Select Teachers'
        : 'Data found. If junction table is empty but ManyToMany has data, run sync endpoint.'
    });
  } catch (error: any) {
    console.error('[diagnoseTeacherClasses] Error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Create account for existing teacher
export const createTeacherAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({ where: { id } });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teacher already has an account
    if (teacher.userId) {
      const existingUser = await userRepository.findOne({ where: { id: teacher.userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Teacher already has an account' });
      }
    }

    // Create temporary user account (username is TeacherID, password only, no email)
    const tempUsername = teacher.teacherId; // Username is the TeacherID
    const tempPassword = `temp_${teacher.teacherId}_${Date.now()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Check if the current user is a demo user
    const isDemo = req.user?.isDemo === true || 
                   req.user?.email === 'demo@school.com' || 
                   req.user?.username === 'demo@school.com';
    
    const user = userRepository.create({
      email: null, // Teachers don't require email
      username: tempUsername,
      password: hashedPassword,
      role: UserRole.TEACHER,
      mustChangePassword: true,
      isTemporaryAccount: true,
      isDemo: isDemo // Set isDemo flag based on creator
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);

    res.json({ 
      message: 'Account created successfully',
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        note: 'Teacher must change password on first login. Login with username and password only.'
      }
    });
  } catch (error: any) {
    console.error('Error creating teacher account:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};
