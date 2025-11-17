import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Parent } from '../entities/Parent';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Exam } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { resetDemoDataForLogin } from '../utils/resetDemoData';
import { School } from '../entities/School';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, username, password, schoolCode } = req.body;
    
    // Debug logging
    console.log('🔐 Login attempt:', {
      email,
      username,
      schoolCode,
      hasPassword: !!password,
      passwordLength: password?.length
    });
    
    const userRepository = AppDataSource.getRepository(User);
    const schoolRepository = AppDataSource.getRepository(School);

    if (!schoolCode || !schoolCode.trim()) {
      console.log('❌ Missing school code');
      return res.status(400).json({ message: 'School code is required' });
    }

    const normalizedSchoolCode = schoolCode.trim().toLowerCase();
    const school = await schoolRepository
      .createQueryBuilder('school')
      .where('LOWER(school.schoolid) = :code', { code: normalizedSchoolCode })
      .getOne();

    if (!school || !school.isActive) {
      console.log('❌ School not found or inactive:', normalizedSchoolCode);
      return res.status(404).json({ message: 'Invalid or inactive school code' });
    }

    console.log('✅ School found:', school.name, school.id);

    // Support both email and username login
    const loginIdentifier = username || email;
    if (!loginIdentifier || !password) {
      console.log('❌ Missing identifier or password');
      return res.status(400).json({ message: 'Username/Email and password are required' });
    }
    
    console.log('🔍 Looking for user:', loginIdentifier, 'in school:', school.id);

    // Try to find user by username or email
    let user = await userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.parent', 'parent')
      .where(
        '(LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)) AND user.schoolId = :schoolId',
        { identifier: loginIdentifier, schoolId: school.id }
      )
      .getOne();

    if (!user || !user.isActive) {
      console.log('❌ User not found or inactive in this school');
      // Extra check: if the credentials are correct but belong to another school,
      // inform the user so they can enter the right school code.
      const userAnySchool = await userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)', { identifier: loginIdentifier })
        .getOne();

      if (userAnySchool) {
        console.log('⚠️  User found in different school:', userAnySchool.schoolId);
        const passwordMatches = await bcrypt.compare(password, userAnySchool.password);
        if (passwordMatches && userAnySchool.schoolId !== school.id) {
          const actualSchool = await schoolRepository.findOne({ where: { id: userAnySchool.schoolId } });
          const actualCode = actualSchool?.schoolid || 'the correct school';
          console.log('❌ Password matches but wrong school. Actual school:', actualCode);
          return res.status(403).json({
            message: `This account belongs to the "${actualCode}" school code. Please enter the matching school code to sign in.`
          });
        }
      }

      console.log('❌ Returning 401: Invalid credentials');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ User found:', user.email, user.username, 'Active:', user.isActive);

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('❌ Password does not match');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ Password matches! Login successful');

    // Check if this is the demo account and ensure it's marked as demo
    const isDemoAccount = user.email === 'demo@school.com' || user.username === 'demo@school.com';
    if (isDemoAccount && !user.isDemo) {
      // Update user to mark as demo
      user.isDemo = true;
      await userRepository.save(user);
      console.log('✅ Marked demo account as isDemo = true');
    }

    // If demo user logs in, reset demo data to ensure clean state
    // This ensures each demo user login gets a fresh start without seeing other users' data
    if (user.isDemo || isDemoAccount) {
      try {
        console.log('🔄 Demo user login detected - resetting demo data...');
        await resetDemoDataForLogin(school.id);
        console.log('✅ Demo data reset completed');
        // Refresh user after reset
        const refreshedUser = await userRepository.findOne({
          where: { id: user.id },
          relations: ['student', 'teacher', 'parent']
        });
        if (refreshedUser) {
          user.isDemo = refreshedUser.isDemo;
        }
      } catch (resetError: any) {
        console.error('⚠️ Error resetting demo data on login:', resetError.message);
        console.error(resetError.stack);
        // Continue with login even if reset fails
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    // @ts-ignore - expiresIn accepts string values like '7d' which is valid
    const token = jwt.sign(
      { userId: user.id, role: user.role, schoolId: school.id },
      secret,
      { expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        isTemporaryAccount: user.isTemporaryAccount,
        isDemo: user.isDemo,
        student: user.student,
        teacher: user.teacher,
        parent: user.parent,
        school: {
          id: school.id,
          name: school.name,
          schoolid: school.schoolid,
          logoUrl: school.logoUrl,
          address: school.address,
          phone: school.phone,
          subscriptionEndDate: school.subscriptionEndDate
        }
      },
      school: {
        id: school.id,
        name: school.name,
        schoolid: school.schoolid,
        logoUrl: school.logoUrl,
        address: school.address,
        phone: school.phone,
        subscriptionEndDate: school.subscriptionEndDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password, role, schoolCode, ...profileData } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const schoolRepository = AppDataSource.getRepository(School);

    if (!schoolCode || !schoolCode.trim()) {
      return res.status(400).json({ message: 'School code is required' });
    }

    const normalizedSchoolCode = schoolCode.trim().toLowerCase();
    const school = await schoolRepository
      .createQueryBuilder('school')
      .where('LOWER(school.schoolid) = :code', { code: normalizedSchoolCode })
      .getOne();

    if (!school || !school.isActive) {
      return res.status(404).json({ message: 'Invalid or inactive school code' });
    }

    // Validate password length (minimum 8 characters)
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if email already exists
    const existingUserByEmail = await userRepository.findOne({ where: { email, schoolId: school.id } });
    if (existingUserByEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Check if username already exists (if provided)
    if (username) {
      const existingUserByUsername = await userRepository.findOne({ where: { username, schoolId: school.id } });
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
      email,
      username: username || null,
      password: hashedPassword,
      role: requestedRole,
      schoolId: school.id
    });

    await userRepository.save(user);

    // Create profile based on role
    if (requestedRole === UserRole.STUDENT) {
      const studentRepository = AppDataSource.getRepository(Student);
      const student = studentRepository.create({
        ...profileData,
        userId: user.id,
        schoolId: school.id
      });
      await studentRepository.save(student);
    } else if (requestedRole === UserRole.TEACHER) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = teacherRepository.create({
        ...profileData,
        userId: user.id,
        schoolId: school.id
      });
      await teacherRepository.save(teacher);
    } else if (requestedRole === UserRole.PARENT) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const parent = parentRepository.create({
        ...profileData,
        userId: user.id,
        email: email,
        schoolId: school.id
      });
      await parentRepository.save(parent);
    }
    // SUPERADMIN and ADMIN don't need separate profile entities

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email, schoolCode } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const parentRepository = AppDataSource.getRepository(Parent);
    const schoolRepository = AppDataSource.getRepository(School);

    if (!email || !schoolCode) {
      return res.status(400).json({ message: 'Email and school code are required' });
    }

    const school = await schoolRepository
      .createQueryBuilder('school')
      .where('LOWER(school.schoolid) = :code', { code: schoolCode.trim().toLowerCase() })
      .getOne();

    if (!school || !school.isActive) {
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    // Find user by email (check both User.email and Parent.email)
    let user = await userRepository.findOne({ where: { email, schoolId: school.id } });
    
    // If not found in User, check Parent entity
    if (!user) {
      const parent = await parentRepository.findOne({ where: { email, schoolId: school.id } });
      if (parent) {
        user = await userRepository.findOne({ where: { id: parent.userId, schoolId: school.id } });
      }
    }

    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    // Generate reset token (simple implementation - in production, use crypto.randomBytes)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset', schoolId: school.id },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // In production, send email with reset link
    // For now, we'll just return success (email sending would be implemented here)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    // TODO: Send email with reset link: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}

    res.json({ 
      message: 'If the email exists, a password reset link has been sent',
      // In development, return token (remove in production)
      token: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Create or update demo account (public endpoint for initial setup)
export const createDemoAccount = async (req: Request, res: Response) => {
  try {
    const demoEmail = 'demo@school.com';
    const demoUsername = 'demo@school.com';
    const demoPassword = 'Demo@123';

    const userRepository = AppDataSource.getRepository(User);
    const schoolRepository = AppDataSource.getRepository(School);

    let demoSchool = await schoolRepository.findOne({ where: { schoolid: 'demo' } });
    if (!demoSchool) {
      demoSchool = schoolRepository.create({
        name: 'Demo School',
        schoolid: 'demo',
        isActive: true
      });
      await schoolRepository.save(demoSchool);
    }

    // Check if demo user already exists
    const existingUser = await userRepository.findOne({
      where: [
        { email: demoEmail, schoolId: demoSchool.id },
        { username: demoUsername, schoolId: demoSchool.id }
      ]
    });

    if (existingUser) {
      // Update existing user to ensure it's marked as demo
      const hashedPassword = await bcrypt.hash(demoPassword, 10);
      existingUser.isDemo = true;
      existingUser.role = UserRole.ADMIN;
      existingUser.isActive = true;
      existingUser.mustChangePassword = false;
      existingUser.isTemporaryAccount = false;
      existingUser.password = hashedPassword;
      
      existingUser.schoolId = demoSchool.id;
      await userRepository.save(existingUser);
      return res.json({ 
        message: 'Demo account updated successfully',
        email: demoEmail,
        password: demoPassword
      });
    } else {
      // Create new demo user
      const hashedPassword = await bcrypt.hash(demoPassword, 10);
      const demoUser = userRepository.create({
        username: demoUsername,
        email: demoEmail,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isActive: true,
        isDemo: true,
        mustChangePassword: false,
        isTemporaryAccount: false,
        schoolId: demoSchool.id
      });

      await userRepository.save(demoUser);
      return res.json({ 
        message: 'Demo account created successfully',
        email: demoEmail,
        password: demoPassword
      });
    }
  } catch (error: any) {
    console.error('Error creating demo account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
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
    const user = await userRepository.findOne({ where: { id: decoded.userId, schoolId: decoded.schoolId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await userRepository.save(user);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

