import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
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

