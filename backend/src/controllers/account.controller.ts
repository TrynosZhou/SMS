import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';

// Update user account (username and password) - works for teachers, parents, and students
export const updateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { newUsername, newEmail, currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Prevent demo users from changing their password
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot change password. This is a demo environment.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Allow updating password only, or username/email with password
    // If neither username nor email is provided, that's okay - user just wants to change password

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Check if new username already exists (if different from current)
    if (newUsername && newUsername !== user.username) {
      const existingUser = await userRepository.findOne({ where: { username: newUsername } });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }

    // Check if new email already exists (if provided and different from current)
    if (newEmail && newEmail !== user.email) {
      const existingUser = await userRepository.findOne({ where: { email: newEmail } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update username if provided
    if (newUsername) {
      user.username = newUsername;
    }

    // Update email if provided
    if (newEmail) {
      user.email = newEmail;
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.isTemporaryAccount = false;

    await userRepository.save(user);

    res.json({ 
      message: 'Account updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error updating teacher account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get current user account info
export const getAccountInfo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ 
      where: { id: userId },
      relations: ['teacher', 'parent', 'student']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      isTemporaryAccount: user.isTemporaryAccount,
      isDemo: user.isDemo,
      teacher: user.teacher,
      parent: user.parent,
      student: user.student
    });
  } catch (error: any) {
    console.error('Error getting account info:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

const generateTemporaryPassword = () => {
  return `Temp-${randomBytes(4).toString('hex')}-${Date.now().toString().slice(-4)}`;
};

// Admin/SuperAdmin: Create user accounts manually
export const createUserAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = req.user.role;
    if (actingRole !== UserRole.ADMIN && actingRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Administrators can create user accounts' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      email,
      username,
      role,
      password,
      generatePassword = true,
      isDemo = false
    } = req.body || {};

    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (actingRole !== UserRole.SUPERADMIN && requestedRole === UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Super Admins can create Super Admin accounts' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const trimmedEmail = String(email).trim().toLowerCase();

    const existingByEmail = await userRepository.findOne({ where: { email: trimmedEmail } });
    if (existingByEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    let finalUsername = (username ? String(username) : trimmedEmail.split('@')[0] || 'user')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (!finalUsername) {
      finalUsername = `user_${Date.now()}`;
    }
    const baseUsername = finalUsername;
    let suffix = 1;
    let usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    while (usernameExists) {
      finalUsername = `${baseUsername}${suffix++}`;
      usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    }

    let plainPassword = (password ? String(password).trim() : '');
    let autoGenerated = false;
    if (!plainPassword) {
      plainPassword = generateTemporaryPassword();
      autoGenerated = true;
    }

    if (plainPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = userRepository.create({
      email: trimmedEmail,
      username: finalUsername,
      password: hashedPassword,
      role: requestedRole,
      isDemo: actingRole === UserRole.SUPERADMIN ? isDemo === true : false,
      mustChangePassword: true,
      isTemporaryAccount: autoGenerated,
      isActive: true
    });

    await userRepository.save(user);

    res.status(201).json({
      message: 'User account created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isDemo: user.isDemo
      },
      temporaryCredentials: autoGenerated ? { password: plainPassword } : undefined
    });
  } catch (error: any) {
    console.error('Error creating user account:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

