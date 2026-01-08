import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Parent } from '../entities/Parent';
import { resetDemoDataForLogin } from '../utils/resetDemoData';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { validatePhoneNumber } from '../utils/phoneValidator';
import { parseDOB, compareDates, formatDOB } from '../utils/dateParser';

export const login = async (req: Request, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { email, username, password, teacherId } = req.body;
    
    console.log('[Login] Request received:', { 
      email: email || null,
      username: username || null,
      hasPassword: !!password, 
      hasTeacherId: !!teacherId 
    });
    
    const userRepository = AppDataSource.getRepository(User);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const studentRepository = AppDataSource.getRepository(Student);

    // Support username login (email is optional, mainly for non-teachers)
    // For teachers, only username is required
    const loginIdentifier = username || email;
    if (!loginIdentifier || !password) {
      console.log('[Login] Missing credentials:', { loginIdentifier: !!loginIdentifier, password: !!password });
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check if this is a student login attempt (StudentID as username, DOB as password)
    // First, try to find a student by studentNumber (case-insensitive)
    let user: User | null = null;
    let student = null;
    try {
      student = await studentRepository
        .createQueryBuilder('student')
        .leftJoinAndSelect('student.user', 'user')
        .where('LOWER(student.studentNumber) = LOWER(:studentNumber)', { studentNumber: loginIdentifier })
        .getOne();
    } catch (dbError: any) {
      // Check if error is due to missing table
      if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
        console.error('[Login] Database tables not found. Please ensure DB_SYNC=true or run migrations.');
        return res.status(503).json({ 
          message: 'Database schema not initialized. Please contact administrator or set DB_SYNC=true in development.',
          error: 'Database tables missing'
        });
      }
      // Re-throw other database errors
      throw dbError;
    }

    if (student) {
      // This is a student login attempt
      console.log('[Login] Student found by studentNumber:', loginIdentifier);
      console.log('[Login] Student ID:', student.id, 'Student Number:', student.studentNumber);
      
      try {
      console.log('[Login] Student DOB from DB:', student.dateOfBirth);
      console.log('[Login] Password received (DOB):', password);
      
      // Validate DOB format (dd/mm/yyyy)
      const parsedDOB = parseDOB(password);
      if (!parsedDOB) {
        console.log('[Login] Invalid DOB format. Expected dd/mm/yyyy, received:', password);
        return res.status(401).json({ message: 'Invalid date of birth format. Please use dd/mm/yyyy format.' });
      }

      console.log('[Login] Parsed DOB:', parsedDOB);

      // Compare the parsed DOB with student's dateOfBirth
      // Handle different date formats from database
      let studentDOB: Date;
      if (student.dateOfBirth instanceof Date) {
        studentDOB = student.dateOfBirth;
      } else if (typeof student.dateOfBirth === 'string') {
        // If it's a string, parse it (could be ISO format or other)
        studentDOB = new Date(student.dateOfBirth);
        if (isNaN(studentDOB.getTime())) {
          console.error('[Login] Invalid dateOfBirth in database:', student.dateOfBirth);
          return res.status(500).json({ message: 'Server error: Invalid date of birth in database' });
        }
      } else {
        studentDOB = new Date(student.dateOfBirth);
      }
      
      console.log('[Login] Student DOB (normalized):', studentDOB);
      console.log('[Login] Parsed DOB (from input):', parsedDOB);
      console.log('[Login] Date comparison result:', compareDates(parsedDOB, studentDOB));
      
      if (!compareDates(parsedDOB, studentDOB)) {
        console.log('[Login] DOB mismatch for student:', student.id);
        console.log('[Login] Expected:', formatDOB(studentDOB), 'Got:', formatDOB(parsedDOB));
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check if student is active
      if (!student.isActive) {
        console.log('[Login] Student account is inactive:', student.id);
        return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
      }

      // Find or create user account for this student
      if (!student.user) {
        console.log('[Login] Student has no linked user, checking for existing user...');
        
        // First, check if a user with this studentNumber as username already exists
        const existingUser = await userRepository.findOne({
          where: { username: student.studentNumber }
        });
        
        if (existingUser) {
          console.log('[Login] Found existing user with studentNumber as username, linking to student');
          // Link the existing user to the student
          student.userId = existingUser.id;
          await studentRepository.save(student);
          user = existingUser;
        } else {
          console.log('[Login] Creating new user account for student:', student.id);
          // Create a user account for the student if it doesn't exist
          // Use studentNumber as username, and hash the DOB as password for future use
          const hashedPassword = await bcrypt.hash(password, 10);
          user = userRepository.create({
            username: student.studentNumber,
            password: hashedPassword,
            role: UserRole.STUDENT,
            isActive: true
          });
          await userRepository.save(user);
          
          // Link student to user
          student.userId = user.id;
          await studentRepository.save(student);
        }
        
        // After linking, verify the link was saved
        console.log('[Login] Student userId after save:', student.userId);
      } else {
        user = student.user;
        console.log('[Login] Using existing user linked to student');
      }

      // Ensure user is set before loading relations
      if (!user || !user.id) {
        console.error('[Login] User not properly initialized for student');
        return res.status(500).json({ message: 'Server error during authentication' });
      }

      // Verify student.userId matches user.id before querying
      if (student.userId !== user.id) {
        console.log('[Login] Student userId mismatch, updating...');
        student.userId = user.id;
        await studentRepository.save(student);
      }

      // Load user with all relations (including student's class)
      const userIdToLoad = user.id;
      console.log('[Login] Loading user with relations, userId:', userIdToLoad, 'student.userId:', student.userId);
      
      // First try standard relation-based query
      user = await userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.student', 'student')
        .leftJoinAndSelect('student.classEntity', 'classEntity')
        .leftJoinAndSelect('user.teacher', 'teacher')
        .leftJoinAndSelect('user.parent', 'parent')
        .where('user.id = :id', { id: userIdToLoad })
        .getOne();
      
      // If student relation not loaded, try querying student directly and attaching
      if (user && !user.student) {
        console.log('[Login] Student relation not loaded via standard query, trying direct student query...');
        const studentDirect = await studentRepository.findOne({
          where: { userId: userIdToLoad },
          relations: ['classEntity']
        });
        if (studentDirect) {
          user.student = studentDirect;
          console.log('[Login] Student loaded directly and attached to user');
        }
      }

      if (!user) {
        console.error('[Login] Failed to create or load user for student');
        return res.status(500).json({ message: 'Server error during authentication' });
      }

      if (!user.isActive) {
        console.log('[Login] User account is inactive:', user.id);
        return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
      }

      // Verify student data is loaded - if not, try alternative query
      if (!user.student) {
        console.error('[Login] ERROR: Student relation not loaded for user:', user.id);
        console.log('[Login] Attempting alternative query using student.userId...');
        
        // Try querying by student's userId directly
        const studentByUserId = await studentRepository.findOne({
          where: { userId: user.id },
          relations: ['classEntity']
        });
        
        if (studentByUserId) {
          console.log('[Login] Found student by userId, manually attaching to user object');
          user.student = studentByUserId;
        } else {
          console.error('[Login] CRITICAL: Student not found by userId:', user.id);
          console.error('[Login] Student ID:', student.id, 'Student userId in DB:', student.userId);
          // Try one more time with the original student object
          if (student.userId === user.id) {
            console.log('[Login] Using original student object since userId matches');
            user.student = student;
          } else {
            return res.status(500).json({ message: 'Failed to load student information. Please contact the administrator.' });
          }
        }
      }

      console.log('[Login] Student authenticated successfully:', student.studentNumber);
      if (user.student) {
        console.log('[Login] Student ID:', user.student.id, 'Class ID:', user.student.classId || user.student.classEntity?.id);
      } else {
        console.error('[Login] WARNING: Student object not attached to user after all attempts');
      }
      } catch (studentError: any) {
        console.error('[Login] Error during student authentication:', studentError);
        console.error('[Login] Error message:', studentError.message);
        console.error('[Login] Error stack:', studentError.stack);
        return res.status(500).json({ 
          message: 'Server error during student authentication', 
          error: studentError.message || 'Unknown error' 
        });
      }
    } else {
      // Not a student login, proceed with regular user authentication
      console.log('[Login] No student found with studentNumber:', loginIdentifier);
      console.log('[Login] Proceeding with regular user authentication...');
      // Try to find user by username or email (email can be null for teachers)
      try {
        user = await userRepository
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.student', 'student')
          .leftJoinAndSelect('user.teacher', 'teacher')
          .leftJoinAndSelect('user.parent', 'parent')
          .where(
            'LOWER(user.username) = LOWER(:identifier) OR (user.email IS NOT NULL AND LOWER(user.email) = LOWER(:identifier))',
            { identifier: loginIdentifier }
          )
          .getOne();
      } catch (dbError: any) {
        // Check if error is due to missing table
        if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
          console.error('[Login] Database tables not found. Please ensure DB_SYNC=true or run migrations.');
          return res.status(503).json({ 
            message: 'Database schema not initialized. Please contact administrator or set DB_SYNC=true in development.',
            error: 'Database tables missing'
          });
        }
        // Re-throw other database errors
        throw dbError;
      }

      if (!user) {
        console.log('[Login] User not found for identifier:', loginIdentifier);
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      if (!user.isActive) {
        console.log('[Login] User account is inactive:', user.id);
        return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
      }

      try {
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
          console.log('[Login] Password mismatch for user:', user.id);
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } catch (passwordError: any) {
        console.error('[Login] Error comparing password:', passwordError);
        return res.status(500).json({ message: 'Server error during authentication' });
      }
    }

    // Load teacher with classes if user is a teacher
    if (user.role === UserRole.TEACHER) {
      try {
        console.log('[Login] Teacher login detected, loading teacher profile...');
        
        // Step 1: Find teacher by userId (as per requirements)
        let teacher = await teacherRepository.findOne({
          where: { userId: user.id }
        });
        
        // Check if the found teacher is a placeholder (wrong teacher)
        const isPlaceholderTeacher = teacher && 
          (teacher.firstName === 'Teacher' || teacher.lastName === 'Account' ||
           (teacher.firstName === 'Teacher' && teacher.lastName === 'Account'));
        
        // If teacher is a placeholder or not found, try to find correct teacher by teacherId (username)
        if ((!teacher || isPlaceholderTeacher) && user.username) {
          if (isPlaceholderTeacher) {
            console.log('[Login] ⚠️ User is linked to placeholder teacher, finding correct teacher...');
            console.log('[Login] Placeholder teacher:', teacher.firstName, teacher.lastName, 'ID:', teacher.id);
          } else {
            console.log('[Login] Teacher not found by userId, trying by teacherId (username):', user.username);
          }
          
          // First try to find teacher with real name (not default placeholders) matching username
          const correctTeacher = await teacherRepository
            .createQueryBuilder('teacher')
            .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: user.username })
            .andWhere("teacher.firstName != 'Teacher'")
            .andWhere("teacher.lastName != 'Account'")
            .getOne();
          
          if (correctTeacher) {
            console.log('[Login] ✓ Found correct teacher:', correctTeacher.firstName, correctTeacher.lastName);
            
            // If user was linked to wrong teacher, unlink it
            if (teacher && teacher.id !== correctTeacher.id) {
              console.log('[Login] 🔧 Unlinking wrong teacher (placeholder)...');
              teacher.userId = null;
              await teacherRepository.save(teacher);
              console.log('[Login] ✓ Wrong teacher unlinked');
            }
            
            // Link correct teacher to user
            if (correctTeacher.userId !== user.id) {
              console.log('[Login] 🔧 Linking correct teacher to user account...');
              correctTeacher.userId = user.id;
              await teacherRepository.save(correctTeacher);
              console.log('[Login] ✓ Correct teacher linked to user account');
            }
            
            teacher = correctTeacher;
          } else {
            // If not found with real name, try any teacher with matching teacherId (last resort)
            const anyTeacher = await teacherRepository.findOne({
              where: { teacherId: user.username }
            });
            
            if (anyTeacher && anyTeacher.id !== teacher?.id) {
              console.log('[Login] Found teacher by teacherId (may be placeholder):', anyTeacher.firstName, anyTeacher.lastName);
              
              // Unlink wrong teacher if exists
              if (teacher && teacher.id !== anyTeacher.id) {
                console.log('[Login] 🔧 Unlinking wrong teacher...');
                teacher.userId = null;
                await teacherRepository.save(teacher);
              }
              
              // Link this teacher (even if placeholder, better than nothing)
              if (anyTeacher.userId !== user.id) {
                anyTeacher.userId = user.id;
                await teacherRepository.save(anyTeacher);
                console.log('[Login] Teacher linked to user account');
              }
              
              teacher = anyTeacher;
            }
          }
        }
        
        // If teacher profile doesn't exist, return error (don't auto-create)
        if (!teacher) {
          console.log('[Login] Teacher profile not found for userId:', user.id);
          return res.status(404).json({ 
            message: 'Teacher profile not found. Please contact the administrator.' 
          });
        }
        
        // Log final teacher info
        console.log('[Login] Using teacher:', teacher.firstName, teacher.lastName, 'ID:', teacher.id, 'TeacherID:', teacher.teacherId);
        
        // Step 2: Build full name (LastName + FirstName)
        // Only use placeholder if both firstName and lastName are placeholders
        const hasValidName = teacher.firstName && 
                            teacher.firstName.trim() && 
                            teacher.firstName !== 'Teacher' && 
                            teacher.firstName !== 'Account' &&
                            teacher.lastName && 
                            teacher.lastName.trim() && 
                            teacher.lastName !== 'Teacher' && 
                            teacher.lastName !== 'Account';
        
        let fullName: string;
        if (hasValidName) {
          fullName = `${teacher.lastName.trim()} ${teacher.firstName.trim()}`.trim();
        } else {
          // If we have any valid part, use it; otherwise use placeholder
          const lastName = (teacher.lastName && teacher.lastName !== 'Teacher' && teacher.lastName !== 'Account') 
            ? teacher.lastName.trim() : '';
          const firstName = (teacher.firstName && teacher.firstName !== 'Teacher' && teacher.firstName !== 'Account') 
            ? teacher.firstName.trim() : '';
          
          if (lastName || firstName) {
            fullName = `${lastName} ${firstName}`.trim();
          } else {
            fullName = 'Teacher'; // Last resort placeholder
            console.log('[Login] ⚠️ Warning: Teacher has placeholder name, showing "Teacher"');
          }
        }
        
        console.log('[Login] Teacher full name:', fullName);
        console.log('[Login] Teacher firstName:', teacher.firstName, 'lastName:', teacher.lastName);
        
        // Step 3: Fetch active classes from junction table
        // Query: teacher_classes JOIN classes WHERE classes.isActive = TRUE
        const { TeacherClass } = await import('../entities/TeacherClass');
        const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
        
        let classes: any[] = [];
        
        try {
          // Query junction table joined with classes, filtering for active classes only
          const teacherClasses = await teacherClassRepository
            .createQueryBuilder('tc')
            .innerJoinAndSelect('tc.class', 'class')
            .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
            .andWhere('class.isActive = :isActive', { isActive: true })
            .getMany();
          
          // Extract class objects
          classes = teacherClasses.map(tc => ({
            id: tc.class.id,
            name: tc.class.name,
            form: tc.class.form,
            description: tc.class.description,
            isActive: tc.class.isActive
          }));
          
          console.log('[Login] ✓ Loaded', classes.length, 'active classes from junction table');
          console.log('[Login] Classes:', classes.map(c => c.name).join(', '));
        } catch (error: any) {
          console.error('[Login] Error fetching classes from junction table:', error.message);
          // Return empty array if query fails
          classes = [];
        }
        
      // Build teacher response object with fullName in LastName + FirstName format
      const teacherResponse = {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        fullName: fullName, // Already formatted as LastName + FirstName
        phoneNumber: teacher.phoneNumber,
        address: teacher.address,
        dateOfBirth: teacher.dateOfBirth,
        isActive: teacher.isActive
      };
        
        // Attach teacher and classes to user object
        (user as any).teacher = teacherResponse;
        (user as any).classes = classes;
        
        console.log('[Login] Teacher authenticated:', fullName, '- Classes:', classes.length);
        console.log('[Login] Teacher ID:', teacher.teacherId);
        console.log('[Login] Full Name:', fullName);
        console.log('[Login] Classes:', classes.length);
      } catch (teacherError: any) {
        console.error('[Login] Error loading teacher profile:', teacherError);
        console.error('[Login] Error stack:', teacherError.stack);
        // Don't fail login if teacher profile loading fails - just log it
        // The user can still log in, but teacher data won't be available
        console.log('[Login] Continuing login without teacher profile data');
      }
    }

    // Check if this is the demo account and ensure it's marked as demo
    const isDemoAccount = (user.email && user.email === 'demo@school.com') || user.username === 'demo@school.com';
    if (isDemoAccount) {
      if (!user.isDemo) {
        user.isDemo = true;
        await userRepository.save(user);
      }

      // Ensure demo data is available for the session
      try {
        console.log('[Auth] Demo login detected - ensuring demo data is available');
        await resetDemoDataForLogin();
        await ensureDemoDataAvailable();
        console.log('[Auth] Demo data ready');
      } catch (resetError) {
        console.error('[Auth] Error ensuring demo data:', (resetError as Error).message);
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
    // @ts-ignore - expiresIn accepts string values like '30m' which is valid
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
      { expiresIn }
    );

    // Build response based on user role
    const response: any = {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        isTemporaryAccount: user.isTemporaryAccount,
        isDemo: user.isDemo
      }
    };

    // For teachers, include teacher object with full name and classes list
    if (user.role === UserRole.TEACHER && user.teacher) {
      response.user.teacher = user.teacher;
      response.user.classes = (user as any).classes || [];
    } else {
      // For other roles, include their respective profiles
      if (user.student) {
        // Ensure student object includes all necessary fields
        response.user.student = {
          id: user.student.id,
          firstName: user.student.firstName,
          lastName: user.student.lastName,
          studentNumber: user.student.studentNumber,
          classId: user.student.classId,
          classEntity: user.student.classEntity ? {
            id: user.student.classEntity.id,
            name: user.student.classEntity.name,
            form: user.student.classEntity.form
          } : null,
          dateOfBirth: user.student.dateOfBirth,
          gender: user.student.gender,
          isActive: user.student.isActive
        };
        console.log('[Login] Student data included in response:', response.user.student.studentNumber, 'Class:', response.user.student.classEntity?.name);
      }
      if (user.parent) response.user.parent = user.parent;
    }

    res.json(response);
  } catch (error: any) {
    console.error('[Login] Error:', error);
    console.error('[Login] Error code:', error.code);
    console.error('[Login] Error message:', error.message);
    
    // Check if error is due to missing database tables
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      console.error('[Login] Database tables not found. Please ensure DB_SYNC=true or run migrations.');
      return res.status(503).json({ 
        message: 'Database schema not initialized. Please contact administrator or set DB_SYNC=true in development.',
        error: 'Database tables missing',
        hint: 'Set DB_SYNC=true in your .env file to auto-create tables, or run migrations.'
      });
    }
    
    // Generic error response
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password, role, ...profileData } = req.body;
    const userRepository = AppDataSource.getRepository(User);

    // Validate password length (minimum 8 characters)
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if email already exists
    const existingUserByEmail = await userRepository.findOne({ where: { email } });
    if (existingUserByEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Check if username already exists (if provided)
    if (username) {
      const existingUserByUsername = await userRepository.findOne({ where: { username } });
      if (existingUserByUsername) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }

    // Validate role - only allow SUPERADMIN, ADMIN, and PARENT for self-registration
    const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.PARENT];
    const requestedRole = role ? (role.toLowerCase() as UserRole) : UserRole.STUDENT;
    
    if (!allowedRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role for self-registration. Teachers must use temporary accounts provided by administrator.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = userRepository.create({
      email: email || null, // Email is optional (not required for teachers)
      username: username,
      password: hashedPassword,
      role: requestedRole
    });

    await userRepository.save(user);

    // Create profile based on role
    if (requestedRole === UserRole.STUDENT) {
      const studentRepository = AppDataSource.getRepository(Student);
      const student = studentRepository.create({
        ...profileData,
        userId: user.id
      });
      await studentRepository.save(student);
    } else if (requestedRole === UserRole.TEACHER) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = teacherRepository.create({
        ...profileData,
        userId: user.id
      });
      await teacherRepository.save(teacher);
    } else if (requestedRole === UserRole.PARENT) {
      // Validate phone number for parent registration
      const phoneNumber = profileData.phoneNumber || profileData.contactNumber;
      if (phoneNumber) {
        const phoneValidation = validatePhoneNumber(phoneNumber, true);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
        }
        // Use normalized phone number
        profileData.phoneNumber = phoneValidation.normalized || phoneNumber;
        profileData.contactNumber = phoneValidation.normalized || phoneNumber;
      } else {
        return res.status(400).json({ message: 'Phone number is required for parent registration' });
      }
      
      const parentRepository = AppDataSource.getRepository(Parent);
      const parent = parentRepository.create({
        ...profileData,
        userId: user.id,
        email: email
      });
      await parentRepository.save(parent);
    }
    // SUPERADMIN and ADMIN don't need separate profile entities

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const parentRepository = AppDataSource.getRepository(Parent);

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email (check both User.email and Parent.email)
    let user = await userRepository.findOne({ where: { email } });
    
    // If not found in User, check Parent entity
    if (!user) {
      const parent = await parentRepository.findOne({ where: { email } });
      if (parent) {
        user = await userRepository.findOne({ where: { id: parent.userId } });
      }
    }

    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    // Generate reset token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // In production, send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    // TODO: Send email with reset link: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}

    res.json({ 
      message: 'If the email exists, a password reset link has been sent',
      // In development, return token (remove in production)
      token: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error: any) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret) as any;
      if (decoded.type !== 'password-reset') {
        return res.status(400).json({ message: 'Invalid reset token' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await userRepository.save(user);

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Password reset confirmation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const logout = async (_req: Request, res: Response) => {
  // For JWT-based auth, logout is handled client-side by discarding the token.
  // This endpoint exists to keep the contract consistent for session-based deployments.
  return res.json({ message: 'Logged out successfully' });
};
