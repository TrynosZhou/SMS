import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Parent } from '../entities/Parent';
import { sendPasswordResetEmail } from '../utils/mailer';
import { resetDemoDataForLogin } from '../utils/resetDemoData';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { validatePhoneNumber } from '../utils/phoneValidator';
import { parseDOB, compareDates, formatDOB } from '../utils/dateParser';
import { sendParentRegistrationNotifications } from '../utils/parentRegistrationNotifications';

async function findUserByEmailInsensitive(email: string): Promise<User | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .where('LOWER(TRIM(user.email)) = :email', { email: normalized })
    .getOne();
}

async function findUserByUsernameInsensitive(username: string): Promise<User | null> {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;
  return AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .where('LOWER(TRIM(user.username)) = :username', { username: normalized })
    .getOne();
}

async function findStudentByNumberInsensitive(studentNumber: string): Promise<Student | null> {
  const normalized = String(studentNumber || '').trim();
  if (!normalized) return null;
  return AppDataSource.getRepository(Student)
    .createQueryBuilder('student')
    .where('LOWER(TRIM(student.studentNumber)) = LOWER(:studentNumber)', { studentNumber: normalized })
    .getOne();
}

function normalizeStoredPhone(phone: string | null | undefined): string | null {
  if (!phone || !String(phone).trim()) return null;
  const result = validatePhoneNumber(String(phone), false);
  return result.normalized || String(phone).replace(/[\s\-()]/g, '').trim();
}

function phonesMatch(stored: string | null | undefined, normalizedInput: string): boolean {
  const storedNorm = normalizeStoredPhone(stored);
  return !!storedNorm && storedNorm === normalizedInput;
}

/** Build common Zimbabwe phone string variants for DB lookup (+2637…, 07…, 2637…). */
function phoneSearchVariants(normalizedPhone: string): string[] {
  const variants = new Set<string>();
  const cleaned = String(normalizedPhone || '').trim();
  if (!cleaned) return [];

  variants.add(cleaned);
  if (cleaned.startsWith('+263')) {
    variants.add(`0${cleaned.slice(4)}`);
    variants.add(cleaned.slice(1));
  } else if (cleaned.startsWith('263') && cleaned.length >= 12) {
    variants.add(`+${cleaned}`);
    variants.add(`0${cleaned.slice(3)}`);
  } else if (cleaned.startsWith('0') && cleaned.length >= 10) {
    variants.add(`+263${cleaned.slice(1)}`);
    variants.add(`263${cleaned.slice(1)}`);
  }
  return [...variants];
}

async function findAllParentsByNormalizedPhone(normalizedPhone: string): Promise<Parent[]> {
  if (!normalizedPhone) return [];
  const variants = phoneSearchVariants(normalizedPhone);
  if (!variants.length) return [];

  const parents = await AppDataSource.getRepository(Parent)
    .createQueryBuilder('parent')
    .where('parent.phoneNumber IS NOT NULL')
    .andWhere("TRIM(parent.phoneNumber) <> ''")
    .andWhere('parent.phoneNumber IN (:...variants)', { variants })
    .getMany();

  return parents.filter(p => phonesMatch(p.phoneNumber, normalizedPhone));
}

async function findAllStudentsByNormalizedPhone(normalizedPhone: string): Promise<Student[]> {
  if (!normalizedPhone) return [];
  const variants = phoneSearchVariants(normalizedPhone);
  if (!variants.length) return [];

  const byPhone = await AppDataSource.getRepository(Student)
    .createQueryBuilder('student')
    .where('student.phoneNumber IS NOT NULL')
    .andWhere("TRIM(student.phoneNumber) <> ''")
    .andWhere('student.phoneNumber IN (:...variants)', { variants })
    .getMany();

  const byContact = await AppDataSource.getRepository(Student)
    .createQueryBuilder('student')
    .where('student.contactNumber IS NOT NULL')
    .andWhere("TRIM(student.contactNumber) <> ''")
    .andWhere('student.contactNumber IN (:...variants)', { variants })
    .getMany();

  const merged = new Map<string, Student>();
  for (const s of [...byPhone, ...byContact]) merged.set(s.id, s);
  return [...merged.values()].filter(
    s => phonesMatch(s.phoneNumber, normalizedPhone) || phonesMatch(s.contactNumber, normalizedPhone)
  );
}

async function findParentByNormalizedPhone(normalizedPhone: string): Promise<Parent | null> {
  const matches = await findAllParentsByNormalizedPhone(normalizedPhone);
  return matches.length === 1 ? matches[0] : null;
}

async function findStudentByNormalizedPhone(normalizedPhone: string): Promise<Student | null> {
  const matches = await findAllStudentsByNormalizedPhone(normalizedPhone);
  return matches.length === 1 ? matches[0] : null;
}

async function resolveForgotPasswordUserByEmailOrPhone(
  identifier: string,
  normalizedPhone: string
): Promise<{ user: User | null; message?: string }> {
  const trimmedId = String(identifier || '').trim().toLowerCase();
  const userRepository = AppDataSource.getRepository(User);
  const parentRepository = AppDataSource.getRepository(Parent);

  if (!trimmedId && !normalizedPhone) {
    return { user: null, message: 'Email/username and phone number are required' };
  }

  let identifierMatchUserId: string | null = null;
  const phoneMatchUserIds: string[] = [];

  if (trimmedId) {
    const parentByEmail = await parentRepository
      .createQueryBuilder('parent')
      .where('LOWER(TRIM(parent.email)) = :identifier', { identifier: trimmedId })
      .getOne();
    if (parentByEmail?.userId) {
      identifierMatchUserId = parentByEmail.userId;
    } else {
      const userByEmail = await findUserByEmailInsensitive(trimmedId);
      if (userByEmail?.role === UserRole.PARENT) {
        identifierMatchUserId = userByEmail.id;
      } else {
        const userByUsername = await findUserByUsernameInsensitive(trimmedId);
        if (userByUsername?.role === UserRole.PARENT) {
          identifierMatchUserId = userByUsername.id;
        }
      }
    }
  }

  // Email/username match alone is enough — skip phone scan when identifier matched
  if (identifierMatchUserId) {
    const user = await userRepository.findOne({ where: { id: identifierMatchUserId } });
    if (!user) {
      return { user: null, message: 'Account not found. Please contact the administrator.' };
    }
    return { user };
  }

  if (normalizedPhone) {
    const parentsByPhone = await findAllParentsByNormalizedPhone(normalizedPhone);
    for (const parent of parentsByPhone) {
      if (parent.userId) phoneMatchUserIds.push(parent.userId);
    }
  }

  const uniquePhoneUserIds = [...new Set(phoneMatchUserIds)];
  if (uniquePhoneUserIds.length === 1) {
    const user = await userRepository.findOne({ where: { id: uniquePhoneUserIds[0] } });
    if (!user) {
      return { user: null, message: 'Account not found. Please contact the administrator.' };
    }
    return { user };
  }

  if (uniquePhoneUserIds.length > 1) {
    return {
      user: null,
      message:
        'This phone number is linked to multiple accounts. Enter your email or username as well, or contact the school administrator.',
    };
  }

  return {
    user: null,
    message:
      'No account found with these details. Enter the email, username, or phone number registered with the school.',
  };
}

async function resolveForgotPasswordUserByStudentIdAndDob(
  studentId: string,
  dateOfBirth: string
): Promise<{ user: User | null; message?: string }> {
  const trimmedStudentId = String(studentId || '').trim();
  if (!trimmedStudentId) {
    return { user: null, message: 'Student ID is required' };
  }

  const parsedDOB = parseDOB(String(dateOfBirth || '').trim());
  if (!parsedDOB) {
    return {
      user: null,
      message: 'Invalid date of birth format. Please use dd/mm/yyyy (e.g. 15/03/2010).',
    };
  }

  const student = await findStudentByNumberInsensitive(trimmedStudentId);
  if (!student) {
    return { user: null, message: 'No student found with this Student ID.' };
  }
  if (!student.dateOfBirth) {
    return {
      user: null,
      message: 'Date of birth is not on file for this student. Please contact the school administrator.',
    };
  }

  const studentDob =
    student.dateOfBirth instanceof Date ? student.dateOfBirth : new Date(student.dateOfBirth as any);
  if (!compareDates(parsedDOB, studentDob)) {
    return { user: null, message: 'Student ID and date of birth do not match our records.' };
  }

  if (!student.userId) {
    return {
      user: null,
      message: 'No login account found for this student. Please sign up first or contact the administrator.',
    };
  }

  const user = await AppDataSource.getRepository(User).findOne({ where: { id: student.userId } });
  if (!user) {
    return { user: null, message: 'Account not found. Please contact the administrator.' };
  }
  if (user.role !== UserRole.STUDENT) {
    return { user: null, message: 'Invalid account type for student password reset.' };
  }

  return { user };
}

export const login = async (req: Request, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { email, username, password, teacherId } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket && (req.socket.remoteAddress || (req.connection as any)?.remoteAddress)) || req.ip || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const deviceInfo = (req.headers['sec-ch-ua'] as string) || null;
    
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
    // Trim to avoid whitespace issues
    const loginIdentifier = (username || email)?.trim();
    const trimmedPassword = password?.trim();
    
    if (!loginIdentifier || !trimmedPassword) {
      console.log('[Login] Missing credentials:', { loginIdentifier: !!loginIdentifier, password: !!trimmedPassword });
      // Log failed attempt
      try {
        const { LoginAttemptLog } = require('../entities/LoginAttemptLog');
        const attemptRepo = AppDataSource.getRepository(LoginAttemptLog);
        const attempt = attemptRepo.create({
          userId: null,
          username: loginIdentifier || null,
          role: null,
          success: false,
          ipAddress,
          userAgent,
          deviceInfo
        });
        await attemptRepo.save(attempt);
      } catch (e: any) {
        console.warn('[Login] Failed to record login attempt:', e?.message);
      }
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    console.log('[Login] Attempting login with identifier:', loginIdentifier, 'password length:', trimmedPassword.length);

    // Check if this is a student login attempt
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
      console.log('[Login] Password received (student):', password);

      // Check if student is active
      if (!student.isActive) {
        console.log('[Login] Student account is inactive:', student.id);
        // Record failed student login attempt (inactive)
        try {
          const { LoginAttemptLog } = require('../entities/LoginAttemptLog');
          const attemptRepo = AppDataSource.getRepository(LoginAttemptLog);
          const attempt = attemptRepo.create({
            userId: student.userId || null,
            username: loginIdentifier || null,
            role: 'student',
            success: false,
            ipAddress,
            userAgent,
            deviceInfo
          });
          await attemptRepo.save(attempt);
        } catch (e: any) {
          console.warn('[Login] Failed to record login attempt:', e?.message);
        }
        return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
      }

      if (student.user) {
        user = student.user;
        console.log('[Login] Using existing user linked to student');
      } else if (student.userId) {
        user = await userRepository.findOne({ where: { id: student.userId } });
      } else {
        user = await userRepository.findOne({ where: { username: student.studentNumber } });
        if (user) {
          student.userId = user.id;
          await studentRepository.save(student);
        }
      }

      if (!user) {
        return res.status(401).json({ message: 'Account not found. Please sign up or contact the administrator.' });
      }

      const passwordOk = await bcrypt.compare(trimmedPassword, user.password);
      if (!passwordOk) {
        try {
          const { LoginAttemptLog } = require('../entities/LoginAttemptLog');
          const attemptRepo = AppDataSource.getRepository(LoginAttemptLog);
          const attempt = attemptRepo.create({
            userId: user.id,
            username: loginIdentifier || null,
            role: 'student',
            success: false,
            ipAddress,
            userAgent,
            deviceInfo
          });
          await attemptRepo.save(attempt);
        } catch (e: any) {
          console.warn('[Login] Failed to record login attempt:', e?.message);
        }
        return res.status(401).json({ message: 'Invalid credentials' });
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
      console.log('[Login] Not a student login (username:', loginIdentifier, '), proceeding with user authentication...');
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

      // If user not found by username/email, try finding by teacher Employee Number (for teachers)
      if (!user && loginIdentifier.toUpperCase().startsWith('JPST')) {
        console.log('[Login] User not found by username/email, trying to find by teacher Employee Number:', loginIdentifier);
        try {
          const teacherByEmployeeId = await teacherRepository
            .createQueryBuilder('teacher')
            .leftJoinAndSelect('teacher.user', 'user')
            .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: loginIdentifier })
            .getOne();
          
          if (teacherByEmployeeId && teacherByEmployeeId.user) {
            console.log('[Login] Found teacher by Employee Number, using linked user account');
            user = teacherByEmployeeId.user;
            // Also load relations for the user
            user = await userRepository.findOne({
              where: { id: user.id },
              relations: ['student', 'teacher', 'parent']
            });
          }
        } catch (teacherLookupError: any) {
          console.log('[Login] Error looking up teacher by Employee Number:', teacherLookupError.message);
        }
      }

      // If still not found, try resolving Parent by email -> linked User account
      if (!user && loginIdentifier.includes('@')) {
        try {
          const parentRepository = AppDataSource.getRepository(Parent);
          const parentByEmail = await parentRepository
            .createQueryBuilder('parent')
            .where('LOWER(TRIM(parent.email)) = LOWER(:email)', { email: loginIdentifier })
            .getOne();

          if (parentByEmail) {
            if (!parentByEmail.userId) {
              console.log('[Login] Parent found but no linked user account:', parentByEmail.id, parentByEmail.email);
              return res.status(401).json({
                message: 'Parent account is not linked. Please contact the administrator to create/login credentials.'
              });
            }

            console.log('[Login] Found parent by email, loading linked user:', parentByEmail.userId);
            user = await userRepository.findOne({
              where: { id: parentByEmail.userId },
              relations: ['student', 'teacher', 'parent']
            });
          }
        } catch (parentLookupError: any) {
          console.log('[Login] Error looking up parent by email:', parentLookupError.message);
        }
      }

      // Parent/student login by registered phone number (only when unique)
      if (!user) {
        const phoneResult = validatePhoneNumber(loginIdentifier, false);
        if (phoneResult.isValid && phoneResult.normalized) {
          const parentsByPhone = await findAllParentsByNormalizedPhone(phoneResult.normalized);
          const studentsByPhone = await findAllStudentsByNormalizedPhone(phoneResult.normalized);
          const userIds = new Set<string>();
          for (const p of parentsByPhone) {
            if (p.userId) userIds.add(p.userId);
          }
          for (const s of studentsByPhone) {
            if (s.userId) userIds.add(s.userId);
          }
          if (userIds.size === 1) {
            user = await userRepository.findOne({
              where: { id: [...userIds][0] },
              relations: ['student', 'teacher', 'parent']
            });
          } else if (userIds.size > 1) {
            return res.status(401).json({
              message: 'Invalid credentials',
              hint: 'This phone number is linked to multiple accounts. Sign in with your email or username instead.'
            });
          }
        }
      }

      if (!user) {
        console.log('[Login] User not found for identifier:', loginIdentifier);
        return res.status(401).json({ 
          message: 'Invalid credentials',
          hint: 'Username/email or password is incorrect. Please check your credentials and try again.'
        });
      }
      
      if (!user.isActive) {
        console.log('[Login] User account is inactive:', user.id);
        return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
      }

      const staffRoles = [
        UserRole.ADMIN,
        UserRole.SUPERADMIN,
        UserRole.DIRECTOR,
        UserRole.HEADMASTER,
        UserRole.DEPUTY_HEADMASTER,
        UserRole.ACCOUNTANT,
      ];
      const isStaffRole = staffRoles.includes(user.role);
      const MAX_LOGIN_ATTEMPTS = 3;
      const LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

      if (isStaffRole) {
        const lockedUntil = (user as any).lockedUntil ? new Date((user as any).lockedUntil) : null;
        if (lockedUntil && new Date() < lockedUntil) {
          const isAdmin = user.role === UserRole.ADMIN;
          const message = isAdmin
            ? 'Your account has been locked due to too many failed login attempts. Please contact the superadmin to unlock your account.'
            : 'Your account has been locked due to too many failed login attempts. Please contact the administrator to unlock your account.';
          return res.status(423).json({ message, locked: true });
        }
      }

      try {
        // Password already trimmed above, use it directly
        console.log('[Login] Comparing password for user:', user.id, 'username:', user.username);
        console.log('[Login] Password input length:', trimmedPassword.length, 'hash exists:', !!user.password, 'hash length:', user.password?.length);
        console.log('[Login] User mustChangePassword:', user.mustChangePassword, 'isTemporaryAccount:', user.isTemporaryAccount);
        
        let isValidPassword = await bcrypt.compare(trimmedPassword, user.password);
        
        // If password doesn't match, try reloading user from database (in case of caching/transaction issues)
        if (!isValidPassword) {
          console.log('[Login] ❌ Initial password comparison failed. Reloading user from database...');
          const reloadedUser = await userRepository.findOne({ where: { id: user.id } });
          if (reloadedUser) {
            console.log('[Login] Reloaded user - hash changed:', reloadedUser.password !== user.password);
            console.log('[Login] Reloaded hash starts with:', reloadedUser.password?.substring(0, 20));
            // Try comparing with reloaded user's password
            isValidPassword = await bcrypt.compare(trimmedPassword, reloadedUser.password);
            if (isValidPassword) {
              console.log('[Login] ✓ Password verified with reloaded user (cache/transaction issue resolved)');
              // Update user object with reloaded data
              user.password = reloadedUser.password;
              user.mustChangePassword = reloadedUser.mustChangePassword;
              user.isTemporaryAccount = reloadedUser.isTemporaryAccount;
            } else {
              console.log('[Login] Password still does not match after reload');
            }
          }
        }
        
        if (!isValidPassword) {
          console.log('[Login] ❌ Password mismatch for user:', user.id, 'username:', user.username);
          console.log('[Login] User role:', user.role, 'mustChangePassword:', user.mustChangePassword);
          console.log('[Login] Password length received:', password.length, 'trimmed:', trimmedPassword.length);
          console.log('[Login] User password hash exists:', !!user.password, 'hash starts with:', user.password?.substring(0, 20));

          if (isStaffRole) {
            const attempts = ((user as any).failedLoginAttempts ?? 0) + 1;
            (user as any).failedLoginAttempts = attempts;
            if (attempts >= MAX_LOGIN_ATTEMPTS) {
              (user as any).lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
              await userRepository.save(user);
              const isAdmin = user.role === UserRole.ADMIN;
              const message = isAdmin
                ? 'Too many failed login attempts. Your account has been locked. Please contact the superadmin to unlock your account.'
                : 'Too many failed login attempts. Your account has been locked. Please contact the administrator to unlock your account.';
              return res.status(423).json({ message, locked: true });
            }
            await userRepository.save(user);
            const remaining = MAX_LOGIN_ATTEMPTS - attempts;
            return res.status(401).json({
              message: 'Invalid credentials',
              hint: `${remaining} login attempt(s) remaining before your account is locked.`
            });
          }

          return res.status(401).json({ 
            message: 'Invalid credentials',
            code: 'INVALID_CREDENTIALS',
            hint: user.isTemporaryAccount
              ? 'This account was set up by your school administrator. Use the temporary password they gave you, or click Forgot Password to set a new one.'
              : user.mustChangePassword 
                ? 'Password may have been reset. Please use the new password provided by your administrator. Make sure there are no extra spaces and use the exact password.'
                : trimmedPassword.length < 8
                  ? 'Incorrect password. New passwords must be at least 8 characters — use Forgot Password to set a new one if needed.'
                  : 'Username/email or password is incorrect. Use Forgot Password if you need to reset your password.'
          });
        }

        if (isStaffRole) {
          (user as any).failedLoginAttempts = 0;
          (user as any).lockedUntil = null;
          await userRepository.save(user);
        }
        
        console.log('[Login] ✓ Password verified for user:', user.id, 'username:', user.username, 'role:', user.role);
        
        // For teachers, log the Employee Number for reference
        if (user.role === UserRole.TEACHER && user.teacher) {
          console.log('[Login] Teacher Employee Number:', user.teacher.teacherId, 'matches username:', user.username);
        }
      } catch (passwordError: any) {
        console.error('[Login] Error comparing password:', passwordError);
        return res.status(500).json({ message: 'Server error during authentication' });
      }
    }

    // Load teacher with classes if user is a teacher (skip for universal teacher - no linked Teacher record)
    if (user.role === UserRole.TEACHER) {
      if (user.isUniversalTeacher) {
        console.log('[Login] Universal teacher login - no teacher profile required');
      } else try {
        console.log('[Login] Teacher login detected, loading teacher profile...');
        
        // PRIORITY 1: Always try to find teacher by EmployeeID (username) first - ensures correct teacher record
        let teacher: Teacher | null = null;
        
        if (user.username) {
          const allMatchingByEmployeeId = await teacherRepository
            .createQueryBuilder('teacher')
            .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: user.username })
            .getMany();

          if (allMatchingByEmployeeId.length > 0) {
            // Prioritize non-placeholder teachers
            const isPlaceholder = (t: Teacher) => (
              (t.firstName === 'Teacher' && (!t.lastName || t.lastName === '') && (!t.teacherId || t.teacherId === '')) ||
              (t.firstName === 'Teacher' && t.lastName === 'Account')
            );
            const preferred = allMatchingByEmployeeId.find(t => !isPlaceholder(t));
            if (preferred) {
              teacher = preferred;
              console.log('[Login] ✓ Found teacher by EmployeeID:', preferred.firstName, preferred.lastName, preferred.teacherId);
            } else {
              teacher = allMatchingByEmployeeId[0];
              console.log('[Login] Found teacher by EmployeeID (placeholder):', teacher.firstName, teacher.lastName, teacher.teacherId);
            }
          }
        }

        // PRIORITY 2: If not found by EmployeeID, try by userId (backward compatibility)
        if (!teacher) {
          teacher = await teacherRepository.findOne({
            where: { userId: user.id }
          });
          if (teacher) {
            console.log('[Login] Found teacher by userId:', teacher.firstName, teacher.lastName, teacher.teacherId);
          }
        }

        // PRIORITY 3: If found by userId but it's a placeholder, try to find real teacher by EmployeeID
        const isPlaceholderTeacher = teacher && (
          (teacher.firstName === 'Teacher' && (!teacher.lastName || teacher.lastName === '') && (!teacher.teacherId || teacher.teacherId === '')) ||
          (teacher.firstName === 'Teacher' && teacher.lastName === 'Account')
        );
        
        if (teacher && isPlaceholderTeacher && user.username) {
          console.log('[Login] ⚠️ User is linked to placeholder teacher, finding correct teacher by EmployeeID...');
          const allMatchingByEmployeeId = await teacherRepository
            .createQueryBuilder('teacher')
            .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: user.username })
            .getMany();

          const isPlaceholder = (t: Teacher) => (
            (t.firstName === 'Teacher' && (!t.lastName || t.lastName === '') && (!t.teacherId || t.teacherId === '')) ||
            (t.firstName === 'Teacher' && t.lastName === 'Account')
          );
          const preferred = allMatchingByEmployeeId.find(t => !isPlaceholder(t));
          
          if (preferred && preferred.id !== teacher.id) {
            console.log('[Login] ✓ Found real teacher by EmployeeID:', preferred.firstName, preferred.lastName, preferred.teacherId);
            // Unlink placeholder
            teacher.userId = null;
            await teacherRepository.save(teacher);
            // Link real teacher
            preferred.userId = user.id;
            await teacherRepository.save(preferred);
            teacher = preferred;
          }
        }

        // Ensure teacher is linked to user account
        if (teacher && teacher.userId !== user.id) {
          console.log('[Login] 🔧 Linking teacher to user account...');
          teacher.userId = user.id;
          await teacherRepository.save(teacher);
          console.log('[Login] ✓ Teacher linked to user account');
        }
        
        // If teacher profile doesn't exist: universal teacher (username "teacher") is allowed; others get 404
        if (!teacher) {
          if (user.username && user.username.toLowerCase() === 'teacher') {
            (user as any).isUniversalTeacher = true;
            console.log('[Login] Universal teacher (username "teacher") - no teacher profile required');
          } else {
            console.log('[Login] Teacher profile not found for userId:', user.id);
            return res.status(404).json({
              message: 'Teacher profile not found. Please contact the administrator.'
            });
          }
        } else {
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
        }
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
    const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
    // @ts-ignore - expiresIn accepts string values like '30m' which is valid
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
      { expiresIn }
    );

    // Resolve RBAC permissions for the user
    let permissions: Record<string, boolean> = {};
    let rbacRoleNames: string[] = [];
    try {
      const { resolveUserPermissions, syncUserRoleAssignment } = require('../services/rbac.service');
      const { AppDataSource: DS } = require('../config/database');
      const { UserRbacRole } = require('../entities/UserRbacRole');
      await syncUserRoleAssignment(user);
      permissions = await resolveUserPermissions(user);
      if (DS.isInitialized) {
        const assignments = await DS.getRepository(UserRbacRole).find({
          where: { userId: user.id },
          relations: ['role'],
        });
        rbacRoleNames = assignments.map((a: any) => a.role?.name).filter(Boolean);
      }
    } catch (rbacErr: any) {
      console.warn('[Login] RBAC resolution skipped:', rbacErr?.message);
    }

    // Build response based on user role and set fullName from database for dashboard display
    const response: any = {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        isTemporaryAccount: user.isTemporaryAccount,
        isDemo: user.isDemo,
        isUniversalTeacher: user.isUniversalTeacher === true,
        permissions,
        rbacRoles: rbacRoleNames,
        // Always include user-level firstName/lastName so the frontend can build a display name
        firstName: (user.firstName || '').trim() || null,
        lastName: (user.lastName || '').trim() || null,
      }
    };

    // For teachers, include teacher object with full name and classes list (not for universal teacher)
    if (user.role === UserRole.TEACHER && user.teacher) {
      response.user.teacher = user.teacher;
      response.user.classes = (user as any).classes || [];
      if ((user.teacher as any).fullName) {
        response.user.fullName = (user.teacher as any).fullName;
      } else if (user.teacher.firstName || user.teacher.lastName) {
        response.user.fullName = [user.teacher.lastName, user.teacher.firstName].filter(Boolean).join(' ').trim();
      }
    } else {
      // For other roles, include their respective profiles and fullName from database
      if (user.student) {
        response.user.fullName = [user.student.firstName, user.student.lastName].filter(Boolean).join(' ').trim();
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
      if (user.parent) {
        response.user.parent = user.parent;
        if (!response.user.fullName) {
          response.user.fullName = [user.parent.firstName, user.parent.lastName].filter(Boolean).join(' ').trim();
        }
      }
    }

    // Final fallback: use User-level firstName/lastName (admin, accountant, director, headmaster, etc.)
    if (!response.user.fullName) {
      const fn = (user.firstName || '').trim();
      const ln = (user.lastName || '').trim();
      if (fn || ln) {
        response.user.fullName = [fn, ln].filter(Boolean).join(' ');
      }
    }

    // Last resort: derive a readable display name from the username/email so the navbar
    // never shows a raw email address even when no profile name data exists
    if (!response.user.fullName) {
      const raw = (user.username || user.email || '').trim();
      if (raw.includes('@')) {
        response.user.fullName = raw.split('@')[0];
      } else if (raw) {
        response.user.fullName = raw;
      }
    }

    // Start a user session log
    try {
      const { UserSessionLog } = require('../entities/UserSessionLog');
      const { LoginAttemptLog } = require('../entities/LoginAttemptLog');
      const repo = AppDataSource.getRepository(UserSessionLog);
      const crypto = require('crypto');
      const sessionId: string = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.createHash('sha256').update(`${user.id}-${Date.now()}`).digest('hex');
      const session = repo.create({
        userId: user.id,
        username: user.username || user.email || null,
        role: user.role,
        sessionId,
        ipAddress,
        userAgent,
        deviceInfo,
        loginAt: new Date(),
        lastActivityAt: new Date(),
        modules: 'login',
        timeSpentSeconds: 0
      });
      await repo.save(session);
      // Record successful login attempt
      try {
        const attemptRepo = AppDataSource.getRepository(LoginAttemptLog);
        const attempt = attemptRepo.create({
          userId: user.id,
          username: user.username || user.email || null,
          role: user.role,
          success: true,
          ipAddress,
          userAgent,
          deviceInfo
        });
        await attemptRepo.save(attempt);
      } catch (e: any) {
        console.warn('[Login] Failed to record login attempt:', e?.message);
      }
      // Attach sessionId to response
      (response as any).sessionId = sessionId;
    } catch (e) {
      console.warn('[Login] Failed to create session log:', (e as any)?.message);
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

    const trimmedUsername = (username || '').toString().trim();
    const trimmedPassword = (password || '').toString().trim();
    const trimmedEmail = (email || '').toString().trim();

    if (!trimmedUsername) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!trimmedPassword) {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Validate password length (minimum 8 characters)
    if (trimmedPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if email already exists (only if provided)
    if (trimmedEmail) {
      const existingUserByEmail = await findUserByEmailInsensitive(trimmedEmail);
      if (existingUserByEmail) {
        const message = existingUserByEmail.isTemporaryAccount
          ? 'An account for this email was already created by your school. Sign in with the temporary password from the administrator, or use Reset Password on the login page.'
          : 'This email is already registered. Please sign in or use Reset Password.';
        return res.status(400).json({
          message,
          code: existingUserByEmail.isTemporaryAccount ? 'ADMIN_CREATED_ACCOUNT' : 'EMAIL_ALREADY_EXISTS'
        });
      }
    }

    // Validate role - only allow PARENT and STUDENT for self-registration
    const allowedRoles = [UserRole.PARENT, UserRole.STUDENT];
    const requestedRole = role ? (role.toLowerCase() as UserRole) : UserRole.STUDENT;

    if (!allowedRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role for self-registration. Only Parent and Student can sign up here. Other roles are created by the Administrator under User Management.' });
    }

    // Check if username already exists (case-insensitive)
    const existingUserByUsername = await findUserByUsernameInsensitive(trimmedUsername);
    if (existingUserByUsername) {
      const message =
        requestedRole === UserRole.STUDENT
          ? 'An account already exists for this Student ID. Please sign in or use Forgot Password.'
          : 'Username already exists. Please choose a different username or sign in.';
      return res.status(400).json({
        message,
        code: requestedRole === UserRole.STUDENT ? 'STUDENT_ALREADY_REGISTERED' : 'USERNAME_ALREADY_EXISTS'
      });
    }

    // STUDENT self-signup: username is StudentID (studentNumber). Must already exist in students table.
    if (requestedRole === UserRole.STUDENT) {
      const existingStudent = await findStudentByNumberInsensitive(trimmedUsername);
      if (!existingStudent) {
        return res.status(400).json({
          message: 'Invalid Student ID. Use the exact ID from the school (e.g. JPS5072026) or contact the administrator.',
          code: 'INVALID_STUDENT_ID'
        });
      }
      if (existingStudent.userId) {
        return res.status(400).json({
          message: 'This Student ID is already linked to an account. Please sign in or reset your password.',
          code: 'STUDENT_ALREADY_REGISTERED'
        });
      }

      const canonicalStudentId = String(existingStudent.studentNumber || trimmedUsername).trim();
      const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
      const studentEmail = trimmedEmail || `${canonicalStudentId.toLowerCase()}@student.local`;
      const user = userRepository.create({
        email: studentEmail,
        username: canonicalStudentId,
        password: hashedPassword,
        role: requestedRole
      });
      await userRepository.save(user);

      existingStudent.userId = user.id;
      await AppDataSource.getRepository(Student).save(existingStudent);

      return res.status(201).json({ message: 'User registered successfully' });
    }

    // PARENT self-signup: validate profile fields before creating the user account.
    if (requestedRole === UserRole.PARENT) {
      if (!trimmedEmail) {
        return res.status(400).json({ message: 'Email is required for parent registration' });
      }
      const firstName = String(profileData.firstName || '').trim();
      const lastName = String(profileData.lastName || '').trim();
      if (!firstName || !lastName) {
        return res.status(400).json({ message: 'First name and last name are required for parent registration' });
      }

      const phoneNumber = profileData.phoneNumber || profileData.contactNumber;
      if (!phoneNumber) {
        return res.status(400).json({ message: 'Phone number is required for parent registration' });
      }
      const phoneValidation = validatePhoneNumber(String(phoneNumber), true);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
      }
      const normalizedPhone = phoneValidation.normalized || String(phoneNumber).trim();

      if (!profileData.address || !String(profileData.address).trim()) {
        return res.status(400).json({ message: 'Physical address is required for parent registration' });
      }
      const normalizedAddress = String(profileData.address).trim();

      const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
      const user = userRepository.create({
        email: trimmedEmail,
        username: trimmedUsername,
        password: hashedPassword,
        role: requestedRole
      });
      await userRepository.save(user);

      const parentRepository = AppDataSource.getRepository(Parent);
      const parent = parentRepository.create({
        firstName,
        lastName,
        gender: profileData.gender ? String(profileData.gender).trim() : null,
        phoneNumber: normalizedPhone,
        address: normalizedAddress,
        email: trimmedEmail,
        userId: user.id
      });
      const savedParent = await parentRepository.save(parent);
      const registeredParent = Array.isArray(savedParent) ? savedParent[0] : savedParent;

      try {
        await sendParentRegistrationNotifications({ user, parent: registeredParent });
      } catch (notifyErr: any) {
        console.error('[Register] Parent registration notifications failed:', notifyErr?.message || notifyErr);
      }

      return res.status(201).json({ message: 'User registered successfully' });
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    const user = userRepository.create({
      email: trimmedEmail || null,
      username: trimmedUsername,
      password: hashedPassword,
      role: requestedRole
    });

    await userRepository.save(user);

    // Create profile based on role
    if (requestedRole === UserRole.TEACHER) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = teacherRepository.create({
        ...profileData,
        userId: user.id
      });
      await teacherRepository.save(teacher);
    }

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

    // Send email with reset link (when SMTP is configured)
    const configuredFrontendUrl = (process.env.FRONTEND_URL || '').trim();
    const originFromRequest = `${req.protocol}://${req.get('host')}`;
    const baseUrl = configuredFrontendUrl || originFromRequest;
    const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const mailResult = await sendPasswordResetEmail(email, resetLink);
    if (!mailResult.ok) {
      console.warn('[PasswordReset] Email not sent:', mailResult.error || 'Unknown error');
      // Keep response generic for security.
      // In development environments without SMTP configured, the frontend can still use the returned token.
      console.log(`Password reset token for ${email}: ${resetToken}`);
    }

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

export const verifyForgotPasswordDetails = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      role,
      email,
      phoneNumber,
      username,
      studentId,
      dateOfBirth
    } = req.body || {};

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    const userRepository = AppDataSource.getRepository(User);

    if (
      requestedRole !== UserRole.PARENT &&
      requestedRole !== UserRole.TEACHER &&
      requestedRole !== UserRole.STUDENT
    ) {
      return res.status(403).json({ message: 'Only Parents, Teachers, and Students can reset password here.' });
    }

    let user: User | null = null;

    // Parent: email/username + phone (either may match). Student: Student ID + DOB (both must match).
    if (requestedRole === UserRole.PARENT) {
      const trimmedIdentifier = (email || username || '').toString().trim();
      if (!trimmedIdentifier) {
        return res.status(400).json({ message: 'Email or username is required' });
      }

      const inputPhoneResult = validatePhoneNumber(String(phoneNumber), true);
      if (!inputPhoneResult.isValid) {
        return res.status(400).json({ message: inputPhoneResult.error || 'Invalid phone number format' });
      }
      const normalizedPhone =
        inputPhoneResult.normalized || String(phoneNumber).replace(/[\s\-()]/g, '').trim();

      const resolved = await resolveForgotPasswordUserByEmailOrPhone(trimmedIdentifier, normalizedPhone);
      if (!resolved.user) {
        return res.status(400).json({ message: resolved.message || 'Invalid details' });
      }
      user = resolved.user;
    } else if (requestedRole === UserRole.STUDENT) {
      const trimmedStudentId = (studentId || username || '').toString().trim();
      if (!trimmedStudentId) {
        return res.status(400).json({ message: 'Student ID is required' });
      }
      if (!dateOfBirth || !String(dateOfBirth).trim()) {
        return res.status(400).json({ message: 'Date of birth is required' });
      }

      const resolved = await resolveForgotPasswordUserByStudentIdAndDob(
        trimmedStudentId,
        String(dateOfBirth).trim()
      );
      if (!resolved.user) {
        return res.status(400).json({ message: resolved.message || 'Invalid details' });
      }
      user = resolved.user;
    } else if (requestedRole === UserRole.TEACHER) {
      const trimmedUsername = (username || '').toString().trim();
      if (!trimmedUsername) {
        return res.status(400).json({ message: 'Username is required' });
      }
      const phoneResult = validatePhoneNumber((phoneNumber || '').toString(), true);
      if (!phoneResult.isValid) {
        return res.status(400).json({ message: phoneResult.error || 'Invalid phone number' });
      }
      const normalizedPhone = phoneResult.normalized || (phoneNumber || '').toString().trim();

      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = await teacherRepository
        .createQueryBuilder('teacher')
        .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: trimmedUsername })
        .getOne();

      if (!teacher) {
        return res.status(400).json({ message: 'Invalid details' });
      }

      if (!teacher.phoneNumber) {
        return res.status(400).json({ message: 'Invalid details' });
      }
      const storedTeacherPhoneResult = validatePhoneNumber(String(teacher.phoneNumber), false);
      const storedTeacherPhone = storedTeacherPhoneResult.normalized || String(teacher.phoneNumber).trim();
      if (storedTeacherPhone !== normalizedPhone) {
        return res.status(400).json({ message: 'Invalid details' });
      }

      if (!teacher.userId) {
        return res.status(400).json({ message: 'Account not found. Please contact the administrator.' });
      }

      user = await userRepository.findOne({ where: { id: teacher.userId } });
    } else {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid details' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is inactive. Please contact the administrator.' });
    }
    if (user.isDemo) {
      return res.status(403).json({ message: 'Cannot reset password for demo accounts' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'forgot-password-verified' },
      jwtSecret,
      { expiresIn: '10m' } as SignOptions
    );

    return res.json({ message: 'Verified', token: resetToken });
  } catch (error: any) {
    console.error('[ForgotPasswordVerify] Error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const setForgotPasswordNewPassword = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { token, newPassword, confirmPassword } = req.body || {};
    const trimmedToken = (token || '').toString().trim();
    const trimmedPassword = (newPassword || '').toString().trim();
    const trimmedConfirm = (confirmPassword || '').toString().trim();

    if (!trimmedToken) {
      return res.status(400).json({ message: 'Token is required' });
    }
    if (!trimmedPassword || !trimmedConfirm) {
      return res.status(400).json({ message: 'New password and confirmation are required' });
    }
    if (trimmedPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    if (trimmedPassword !== trimmedConfirm) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(trimmedToken, jwtSecret) as any;
      if (decoded.type !== 'forgot-password-verified' || !decoded.userId) {
        return res.status(400).json({ message: 'Invalid token' });
      }
    } catch {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is inactive. Please contact the administrator.' });
    }
    if (user.isDemo) {
      return res.status(403).json({ message: 'Cannot reset password for demo accounts' });
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    user.password = hashedPassword;
    user.mustChangePassword = false;
    user.isTemporaryAccount = false;
    await userRepository.save(user);

    return res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('[ForgotPasswordSet] Error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const authReq = req as any as { user?: any };
    const user = authReq.user;
    if (!user) return res.json({ message: 'Logged out successfully' });
    const { UserSessionLog } = require('../entities/UserSessionLog');
    const repo = AppDataSource.getRepository(UserSessionLog);
    const session = await repo.findOne({
      where: { userId: user.id, logoutAt: null },
      order: { loginAt: 'DESC' }
    });
    if (session) {
      const now = new Date();
      session.logoutAt = now;
      session.lastActivityAt = now;
      session.timeSpentSeconds = Math.max(0, Math.floor((now.getTime() - session.loginAt.getTime()) / 1000));
      await repo.save(session);
    }
    return res.json({ message: 'Logged out successfully' });
  } catch (e: any) {
    console.warn('[Logout] Failed to close session log:', e?.message);
    return res.json({ message: 'Logged out successfully' });
  }
};
