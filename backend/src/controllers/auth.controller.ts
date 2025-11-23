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

export const login = async (req: Request, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { email, username, password, teacherId } = req.body;
    
    console.log('[Login] Request received:', { 
      hasEmail: !!email, 
      hasUsername: !!username, 
      hasPassword: !!password, 
      hasTeacherId: !!teacherId 
    });
    
    const userRepository = AppDataSource.getRepository(User);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Support username login (email is optional, mainly for non-teachers)
    // For teachers, only username is required
    const loginIdentifier = username || email;
    if (!loginIdentifier || !password) {
      console.log('[Login] Missing credentials:', { loginIdentifier: !!loginIdentifier, password: !!password });
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Try to find user by username or email (email can be null for teachers)
    const user = await userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.parent', 'parent')
      .where(
        'LOWER(user.username) = LOWER(:identifier) OR (user.email IS NOT NULL AND LOWER(user.email) = LOWER(:identifier))',
        { identifier: loginIdentifier }
      )
      .getOne();

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
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    // @ts-ignore - expiresIn accepts string values like '7d' which is valid
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
      if (user.student) response.user.student = user.student;
      if (user.parent) response.user.parent = user.parent;
    }

    res.json(response);
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
