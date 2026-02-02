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
import { createTeacherIdCardPDF } from '../utils/teacherIdCardPdfGenerator';
import { Settings } from '../entities/Settings';
import QRCode from 'qrcode';

export const registerTeacher = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds, photo } = req.body;
    
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
      address: address?.trim() || null,
      photo: photo && typeof photo === 'string' && photo.trim() ? photo.trim() : null
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
    // Exclude placeholder "Teacher Account" records (stub records from old flow)
    try {
      const queryBuilder = teacherRepository
        .createQueryBuilder('teacher')
        .leftJoinAndSelect('teacher.subjects', 'subjects')
        .leftJoinAndSelect('teacher.classes', 'classes')
        .leftJoinAndSelect('teacher.user', 'user')
        .where("NOT (teacher.firstName = 'Teacher' AND teacher.lastName = 'Account')");
      
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
            .leftJoinAndSelect('teacher.user', 'user')
            .where("NOT (teacher.firstName = 'Teacher' AND teacher.lastName = 'Account')");
          
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
          // Last resort: load without any relations, excluding placeholder "Teacher Account"
          const allTeachers = await teacherRepository
            .createQueryBuilder('teacher')
            .where("NOT (teacher.firstName = 'Teacher' AND teacher.lastName = 'Account')")
            .getMany();
          total = allTeachers.length;
          teachers = allTeachers.slice(skip, skip + limit).map((t: any) => ({
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

// Helper: treat "Teacher" with empty fields or "Teacher Account" as placeholder
function isPlaceholderTeacherRecord(teacher: Teacher | null): boolean {
  if (!teacher) return false;
  if (teacher.firstName !== 'Teacher') return false;
  if (!teacher.lastName || teacher.lastName === '') return true;
  if (teacher.lastName === 'Account') return true;
  return false;
}

export const getCurrentTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const username = req.user?.username;

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (userRole !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can access this endpoint' });
    }

    const userEmail = req.user?.email;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    try {
      // PRIORITY 1: Always try to find teacher by EmployeeID (username) first - this ensures we get the correct teacher record
      let teacher: Teacher | null = null;
      
      if (username) {
        // Find ALL teachers with matching EmployeeID (case-insensitive)
        const allMatchingByEmployeeId = await teacherRepository
          .createQueryBuilder('teacher')
          .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: username })
          .getMany();

        if (allMatchingByEmployeeId.length > 0) {
          // Prioritize non-placeholder teachers
          const preferred = allMatchingByEmployeeId.find(t => !isPlaceholderTeacherRecord(t));
          if (preferred) {
            teacher = preferred;
            console.log('[getCurrentTeacher] Found teacher by EmployeeID:', preferred.firstName, preferred.lastName, preferred.teacherId);
          } else {
            // If all are placeholders, use the first one
            teacher = allMatchingByEmployeeId[0];
            console.log('[getCurrentTeacher] Found teacher by EmployeeID (placeholder):', teacher.firstName, teacher.lastName, teacher.teacherId);
          }
        }
      }

      // PRIORITY 2: If not found by EmployeeID, try by userId (for backward compatibility)
      if (!teacher) {
        teacher = await teacherRepository.findOne({
          where: { userId },
          relations: ['subjects', 'classes', 'user']
        });
        if (teacher) {
          console.log('[getCurrentTeacher] Found teacher by userId:', teacher.firstName, teacher.lastName, teacher.teacherId);
        }
      }

      // PRIORITY 3: If found by userId but it's a placeholder, try to find real teacher by EmployeeID
      if (teacher && username && isPlaceholderTeacherRecord(teacher)) {
        const allMatching = await teacherRepository
          .createQueryBuilder('teacher')
          .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: username })
          .getMany();

        const preferred = allMatching.find(t => !isPlaceholderTeacherRecord(t));
        if (preferred && preferred.id !== teacher.id) {
          console.log('[getCurrentTeacher] Re-linking from placeholder to real teacher:', preferred.firstName, preferred.lastName, preferred.teacherId);
          // Unlink placeholder
          teacher.userId = null;
          await teacherRepository.save(teacher);
          // Link real teacher
          preferred.userId = userId;
          await teacherRepository.save(preferred);
          // Reload the real teacher
          const reloadedTeacher = await teacherRepository.findOne({
            where: { id: preferred.id },
            relations: ['subjects', 'classes', 'user']
          });
          if (reloadedTeacher) {
            teacher = reloadedTeacher;
          }
        }
      }

      // Ensure teacher is loaded with relations if we found it
      if (teacher && (!teacher.subjects || !teacher.classes)) {
        teacher = await teacherRepository.findOne({
          where: { id: teacher.id },
          relations: ['subjects', 'classes', 'user']
        }) || teacher;
      }

      if (!teacher) {
        // Try to find teacher via User.teacher relation (userId might not be set on teacher)
        const userWithTeacher = await userRepository.findOne({
          where: { id: userId },
          relations: ['teacher']
        });

        if (userWithTeacher?.teacher) {
          teacher = await teacherRepository.findOne({
            where: { id: userWithTeacher.teacher.id },
            relations: ['subjects', 'classes', 'user']
          });
          if (teacher && !teacher.userId) {
            teacher.userId = userId;
            await teacherRepository.save(teacher);
          }
        }

        if (!teacher) {
          return res.status(404).json({ 
            message: 'Teacher profile not found. Please contact administrator.',
            debug: {
              userId,
              userEmail,
              username,
              suggestion: `Run: UPDATE teachers SET "userId" = '${userId}' WHERE "teacherId" = '${username || 'YOUR_TEACHER_ID'}';`
            }
          });
        }
      }

      if (!teacher.classes) {
        teacher.classes = [];
      }
      teacher.classes = [];

      try {
        const { TeacherClass } = await import('../entities/TeacherClass');
        const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
        
        // Query the junction table using teacher.id (UUID) and filter for active classes only
        const teacherClasses = await teacherClassRepository
          .createQueryBuilder('tc')
          .innerJoinAndSelect('tc.class', 'class')
          .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
          .andWhere('class.isActive = :isActive', { isActive: true })
          .getMany();

        if (teacherClasses.length > 0) {
          teacher.classes = teacherClasses.map(tc => tc.class);
        } else {
          try {
            // Reload teacher with ManyToMany relation
            const teacherWithClasses = await teacherRepository.findOne({
              where: { id: teacher.id },
              relations: ['classes']
            });
            
            if (teacherWithClasses && teacherWithClasses.classes && teacherWithClasses.classes.length > 0) {
              teacher.classes = teacherWithClasses.classes.filter((c: any) => c.isActive === true);
              try {
                const classIds = teacher.classes.map((c: any) => c.id);
                await linkTeacherToClasses(teacher.id, classIds);
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
                try {
                  const classIds = classesWithTeacher.map(c => c.id);
                  await linkTeacherToClasses(teacher.id, classIds);
                } catch (syncError: any) {
                  console.error('[getCurrentTeacher] Error syncing to junction table:', syncError.message);
                }
              } else {
                teacher.classes = [];
              }
            }
          } catch (fallbackError: any) {
            console.error('[getCurrentTeacher] Error in fallback class query:', fallbackError.message);
            teacher.classes = [];
          }
        }
      } catch (junctionError: any) {
        console.error('[getCurrentTeacher] Error loading classes from junction table:', junctionError.message);
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
    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds, photo } = req.body;
    
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
    if (photo !== undefined) {
      (teacher as any).photo = photo && typeof photo === 'string' && photo.trim() ? photo.trim() : null;
    }
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

    // Remove ManyToMany associations (classes, subjects)
    const classCount = teacher.classes?.length || 0;
    const subjectCount = teacher.subjects?.length || 0;
    if (classCount > 0 || subjectCount > 0) {
      teacher.classes = [];
      teacher.subjects = [];
      await teacherRepository.save(teacher);
    }

    // Remove FK references that would block deletion (no CASCADE on Teacher)
    const teacherId = teacher.id;

    // Delete record_books rows that reference this teacher
    try {
      const { RecordBook } = await import('../entities/RecordBook');
      const recordBookRepo = AppDataSource.getRepository(RecordBook);
      await recordBookRepo.delete({ teacherId });
    } catch (rbErr: any) {
      console.warn('[deleteTeacher] RecordBook cleanup:', rbErr.message);
    }

    // Set timetable_entries.teacherId to null where they reference this teacher
    try {
      const { TimetableEntry } = await import('../entities/TimetableEntry');
      const timetableEntryRepo = AppDataSource.getRepository(TimetableEntry);
      await timetableEntryRepo.update({ teacherId }, { teacherId: null as any });
    } catch (teErr: any) {
      console.warn('[deleteTeacher] TimetableEntry cleanup:', teErr.message);
    }

    // Save userId before removing teacher (teachers.userId FK references users.id)
    const linkedUserId = teacher.userId;

    // Delete the teacher FIRST (so users table is no longer referenced by teachers)
    // TeacherClass has onDelete CASCADE so junction rows are removed automatically
    console.log('Deleting teacher:', teacher.firstName, teacher.lastName);
    await teacherRepository.remove(teacher);

    // Now safe to delete the associated user account (no FK from teachers to users)
    if (linkedUserId) {
      const user = await userRepository.findOne({ where: { id: linkedUserId } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

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

    const paramId = req.params.teacherId || req.params.id;

    if (!paramId && req.user) {
      const user = req.user;
      if (user.role === UserRole.TEACHER) {
        teacher = await teacherRepository.findOne({
          where: { userId: user.id }
        });
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

    try {
      const { TeacherClass } = await import('../entities/TeacherClass');
      const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

      const teacherClasses = await teacherClassRepository
        .createQueryBuilder('tc')
        .innerJoinAndSelect('tc.class', 'class')
        .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
        .andWhere('class.isActive = :isActive', { isActive: true })
        .getMany();

      let classes: any[] = [];

      if (teacherClasses.length > 0) {
        classes = teacherClasses.map(tc => ({
          id: tc.class.id,
          name: tc.class.name,
          form: tc.class.form,
          description: tc.class.description,
          isActive: tc.class.isActive
        }));
      } else {
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
          try {
            const { linkTeacherToClasses } = await import('../utils/teacherClassLinker');
            const classIds = classes.map(c => c.id);
            await linkTeacherToClasses(teacher.id, classIds);
          } catch (syncError: any) {
            console.error('[getTeacherClasses] Error syncing to junction table:', syncError.message);
          }
        }
      }

      res.json({ classes });
    } catch (junctionError: any) {
      console.error('[getTeacherClasses] Error loading classes from junction table:', junctionError.message);
      try {
        const teacherWithClasses = await teacherRepository.findOne({
          where: { id: teacher.id },
          relations: ['classes']
        });

        if (teacherWithClasses && teacherWithClasses.classes) {
          const classes = teacherWithClasses.classes
            .filter((c: any) => c.isActive === true)
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              form: c.form,
              description: c.description,
              isActive: c.isActive
            }));
          res.json({ classes });
        } else {
          res.json({ classes: [] });
        }
      } catch (fallbackError: any) {
        console.error('[getTeacherClasses] Fallback also failed:', fallbackError.message);
        res.status(500).json({ 
          message: 'Failed to load teacher classes', 
          error: fallbackError.message,
          details: process.env.NODE_ENV === 'development' ? fallbackError.stack : undefined
        });
      }
    }
  } catch (error: any) {
    console.error('[getTeacherClasses] General error:', error);
    console.error('[getTeacherClasses] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Search teacher by EmployeeID (teacherId) - for self-linking
export const searchTeacherByEmployeeId = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { teacherId } = req.query;
    const currentUserId = req.user?.id;

    if (!teacherId || typeof teacherId !== 'string') {
      return res.status(400).json({ message: 'Teacher ID (EmployeeID) is required' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Find teacher by teacherId (EmployeeID)
    const teacher = await teacherRepository.findOne({
      where: { teacherId: teacherId.trim() },
      relations: ['subjects', 'classes', 'user']
    });

    if (!teacher) {
      return res.status(404).json({
        message: 'No teacher found with this EmployeeID',
        suggestion: 'Please check your EmployeeID and try again'
      });
    }

    const isUniversalTeacher = (req.user as any)?.isUniversalTeacher === true;
    // If teacher is already linked to another user (not current user), reject unless universal teacher (view-only lookup)
    if (!isUniversalTeacher && teacher.userId && teacher.userId !== currentUserId) {
      return res.status(400).json({
        message: 'This teacher account is already linked to another user account',
        alreadyLinked: true
      });
    }

    // Load assigned classes with subjects taught (for my-classes / universal teacher)
    const teacherClasses = await getTeacherClassesWithSubjects(teacher.id);

    const teacherInfo = {
      id: teacher.id,
      teacherId: teacher.teacherId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher',
      subjects: teacher.subjects || [],
      classes: teacherClasses,
      phoneNumber: teacher.phoneNumber,
      address: teacher.address
    };

    // If already linked to current user, return success with alreadyLinked
    if (teacher.userId === currentUserId) {
      return res.json({
        message: 'Your account is already linked to this teacher profile.',
        alreadyLinked: true,
        teacher: teacherInfo
      });
    }

    res.json({
      message: 'Teacher found. Please confirm to link your account.',
      teacher: teacherInfo
    });
  } catch (error: any) {
    console.error('[searchTeacherByEmployeeId] Error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

// Link current logged-in teacher user to their teacher profile (Option A: self-link)
export const linkTeacherAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const username = req.user?.username;
    const bodyTeacherId = req.body?.teacherId ? String(req.body.teacherId).trim() : null;

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (userRole !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can link their account' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    // Resolve TeacherID: use body.teacherId if provided, otherwise username (EmployeeID)
    const teacherIdToUse = bodyTeacherId || username;
    if (!teacherIdToUse) {
      return res.status(400).json({
        message: 'Teacher ID (EmployeeID) is required for linking',
        suggestion: 'Enter your EmployeeID/TeacherID or ensure you logged in with your EmployeeID as username'
      });
    }

    // Find teacher by teacherId (EmployeeID)
    const teacher = await teacherRepository.findOne({
      where: { teacherId: teacherIdToUse },
      relations: ['subjects', 'classes', 'user']
    });

    if (!teacher) {
      return res.status(404).json({
        message: 'No teacher profile found matching this TeacherID (EmployeeID)',
        suggestion: 'Please contact administrator to create your teacher profile',
        debug: { searchedTeacherId: teacherIdToUse }
      });
    }

    // Check if teacher is already linked to a different user
    if (teacher.userId && teacher.userId !== userId) {
      return res.status(400).json({ 
        message: 'This teacher profile is already linked to another user account',
        suggestion: 'Please contact administrator if this is an error'
      });
    }

    // Check if teacher is already linked to current user
    if (teacher.userId === userId) {
      // Already linked, return success with teacher data
      const teacherClasses = await getTeacherClassesData(teacher.id);
      
      return res.json({
        message: 'Your account is already linked to this teacher profile',
        alreadyLinked: true,
        teacher: {
          id: teacher.id,
          teacherId: teacher.teacherId,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher',
          subjects: teacher.subjects || [],
          classes: teacherClasses
        }
      });
    }

    // Link the user account to the teacher profile
    teacher.userId = userId;
    await teacherRepository.save(teacher);

    // Also set the teacher relationship on the user if needed
    const user = await userRepository.findOne({ where: { id: userId } });
    if (user) {
      user.teacher = teacher;
      await userRepository.save(user);
    }

    // Get teacher classes after linking
    const teacherClasses = await getTeacherClassesData(teacher.id);

    const linkedTeacher = {
      id: teacher.id,
      teacherId: teacher.teacherId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher',
      subjects: teacher.subjects || [],
      classes: teacherClasses,
      phoneNumber: teacher.phoneNumber,
      address: teacher.address
    };

    console.log(`[linkTeacherAccount] Successfully linked user ${userId} to teacher ${teacher.teacherId}`);

    res.json({
      message: 'Account linked successfully! You can now access your assigned classes.',
      teacher: linkedTeacher
    });
  } catch (error: any) {
    console.error('[linkTeacherAccount] Error:', error);
    res.status(500).json({ 
      message: 'Server error while linking account', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Helper function to get teacher classes data
async function getTeacherClassesData(teacherId: string): Promise<any[]> {
  try {
    const { TeacherClass } = await import('../entities/TeacherClass');
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    const teacherClasses = await teacherClassRepository
      .createQueryBuilder('tc')
      .innerJoinAndSelect('tc.class', 'class')
      .where('tc.teacherId = :teacherId', { teacherId })
      .andWhere('class.isActive = :isActive', { isActive: true })
      .getMany();

    if (teacherClasses.length > 0) {
      return teacherClasses.map(tc => ({
        id: tc.class.id,
        name: tc.class.name,
        form: tc.class.form,
        description: tc.class.description,
        isActive: tc.class.isActive
      }));
    }

    // Fallback to ManyToMany if junction table is empty
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { id: teacherId },
      relations: ['classes']
    });

    if (teacher?.classes) {
      return teacher.classes
        .filter((c: any) => c.isActive === true)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          form: c.form,
          description: c.description,
          isActive: c.isActive
        }));
    }

    return [];
  } catch (error: any) {
    console.error('[getTeacherClassesData] Error:', error);
    return [];
  }
}

// Helper: get teacher classes with subjects taught (for universal teacher lookup / my-classes)
async function getTeacherClassesWithSubjects(teacherId: string): Promise<any[]> {
  try {
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { id: teacherId },
      relations: ['subjects']
    });
    if (!teacher?.subjects?.length) {
      return getTeacherClassesData(teacherId);
    }
    const teacherSubjectIds = new Set(teacher.subjects.map((s: any) => s.id));

    const { TeacherClass } = await import('../entities/TeacherClass');
    const { Class } = await import('../entities/Class');
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
    const classRepository = AppDataSource.getRepository(Class);

    const teacherClasses = await teacherClassRepository
      .createQueryBuilder('tc')
      .innerJoinAndSelect('tc.class', 'class')
      .where('tc.teacherId = :teacherId', { teacherId })
      .andWhere('class.isActive = :isActive', { isActive: true })
      .getMany();

    if (teacherClasses.length === 0) {
      const fallback = await getTeacherClassesData(teacherId);
      return fallback.map((c: any) => ({ ...c, subjects: [] }));
    }

    const result: any[] = [];
    for (const tc of teacherClasses) {
      const classEntity = await classRepository.findOne({
        where: { id: tc.classId },
        relations: ['subjects']
      });
      const classSubjects = (classEntity?.subjects || []).filter((s: any) => teacherSubjectIds.has(s.id));
      result.push({
        id: tc.class.id,
        name: tc.class.name,
        form: tc.class.form,
        description: tc.class.description,
        isActive: tc.class.isActive,
        subjects: classSubjects.map((s: any) => ({ id: s.id, name: s.name }))
      });
    }
    return result;
  } catch (error: any) {
    console.error('[getTeacherClassesWithSubjects] Error:', error);
    return getTeacherClassesData(teacherId);
  }
}

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

export const generateTeacherIdCardPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Load settings the same way as the Settings page (getSettings): same record, no demo overlay
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' as const },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate QR code with teacher basic data
    const qrPayload = {
      teacherId: teacher.teacherId,
      name: `${teacher.firstName} ${teacher.lastName}`.trim(),
      employeeNumber: teacher.teacherId,
      subjects: teacher.subjects ? teacher.subjects.map((s: any) => s.name).join(', ') : 'Not assigned',
      schoolName: settings?.schoolName || 'School',
      issuedAt: new Date().toISOString()
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));

    const teacherData = {
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      teacherId: teacher.teacherId,
      photo: (teacher as any).photo ?? null,
      subjects: teacher.subjects ? teacher.subjects.map((s: any) => ({ id: s.id, name: s.name })) : [],
      qrDataUrl: qrDataUrl
    };

    const pdfBuffer = await createTeacherIdCardPDF(teacherData, settings);

    const safeName = `${teacher.firstName}-${teacher.lastName}`.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    const filename = `Teacher-ID-${teacher.teacherId}-${safeName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating teacher ID card PDF:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};
