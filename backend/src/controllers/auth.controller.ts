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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;
    const userRepository = AppDataSource.getRepository(User);

    // Support both email and username login
    const loginIdentifier = username || email;
    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: 'Username/Email and password are required' });
    }

    // Try to find user by username or email
    let user = await userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.parent', 'parent')
      .where('user.username = :identifier OR user.email = :identifier', { identifier: loginIdentifier })
      .getOne();

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // If demo user logs in, reset demo data to ensure clean state
    // This ensures each demo user login gets a fresh start without seeing other users' data
    if (user.isDemo) {
      try {
        console.log('🔄 Demo user login detected - resetting demo data...');
        await resetDemoDataForLogin();
        console.log('✅ Demo data reset completed');
      } catch (resetError: any) {
        console.error('⚠️ Error resetting demo data on login:', resetError.message);
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
      { userId: user.id, role: user.role },
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
        parent: user.parent
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
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
      email,
      username: username || null,
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
        email: email // Store email in parent entity for password reset
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

    // Generate reset token (simple implementation - in production, use crypto.randomBytes)
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

    // Check if demo user already exists
    const existingUser = await userRepository.findOne({
      where: [
        { email: demoEmail },
        { username: demoUsername }
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
        isTemporaryAccount: false
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
    const user = await userRepository.findOne({ where: { id: decoded.userId } });

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

