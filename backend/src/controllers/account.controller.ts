import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { IsNull, Not } from 'typeorm';

/** Username for the shared universal teacher account */
export const UNIVERSAL_TEACHER_USERNAME = 'teacher';

// Update user account (username and password) - works for teachers, parents, and students
export const updateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { newUsername, newEmail, currentPassword, newPassword, firstName, lastName } = req.body;

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

    // For teachers, username (TeacherID) cannot be changed, especially on first login
    if (user.role === UserRole.TEACHER) {
      if (newUsername && newUsername !== user.username) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed for teacher accounts' });
      }
      // Also check if teacher is on first login (mustChangePassword is true)
      if (user.mustChangePassword && newUsername) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed. Only password can be changed on first login.' });
      }
    } else {
      // For other roles, check if new username already exists (if different from current)
      if (newUsername && newUsername !== user.username) {
        const existingUser = await userRepository.findOne({ where: { username: newUsername } });
        if (existingUser) {
          return res.status(400).json({ message: 'Username already exists' });
        }
      }
    }

    // Check if new email already exists (if provided and different from current)
    if (newEmail && newEmail !== user.email) {
      const existingUser = await userRepository.findOne({ where: { email: newEmail } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update username if provided (but not for teachers)
    if (newUsername && user.role !== UserRole.TEACHER) {
      user.username = newUsername;
    }

    // Update email if provided
    if (newEmail) {
      user.email = newEmail;
    }

    if (firstName !== undefined) user.firstName = firstName ? String(firstName).trim() || null : null;
    if (lastName !== undefined) user.lastName = lastName ? String(lastName).trim() || null : null;

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.isTemporaryAccount = false;

    await userRepository.save(user);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined;
    res.json({ 
      message: 'Account updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: fullName || undefined
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

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined;
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: fullName || undefined,
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

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    
    // For teachers: username is mandatory, email is not required
    if (requestedRole === UserRole.TEACHER) {
      if (!username || !username.trim()) {
        return res.status(400).json({ message: 'Username is mandatory for teacher accounts' });
      }
    } else {
      // For other roles: email is required
      if (!email) {
        return res.status(400).json({ message: 'Email is required for this role' });
      }
    }
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (actingRole !== UserRole.SUPERADMIN && requestedRole === UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Super Admins can create Super Admin accounts' });
    }

    const userRepository = AppDataSource.getRepository(User);
    
    // Only check email if provided (not required for teachers)
    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const existingByEmail = await userRepository.findOne({ where: { email: trimmedEmail } });
      if (existingByEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Generate username from provided username or email (if available)
    // For teachers, username is mandatory and provided
    let finalUsername: string;
    if (requestedRole === UserRole.TEACHER) {
      // For teachers, use the provided username (already validated as mandatory)
      finalUsername = String(username).replace(/\s+/g, '').toLowerCase();
    } else {
      // For other roles, generate from username or email
      finalUsername = username 
        ? String(username).replace(/\s+/g, '').toLowerCase()
        : (email ? String(email).split('@')[0].replace(/\s+/g, '').toLowerCase() : `user_${Date.now()}`);
      if (!finalUsername) {
        finalUsername = `user_${Date.now()}`;
      }
    }
    
    // Ensure username is unique
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

    // If the role is DEMO_USER, automatically set isDemo to true
    const isDemoUser = requestedRole === UserRole.DEMO_USER;
    
    const user = userRepository.create({
      email: requestedRole === UserRole.TEACHER ? null : (email ? String(email).trim().toLowerCase() : null), // Email is not used for teachers
      username: finalUsername,
      password: hashedPassword,
      role: requestedRole,
      isDemo: isDemoUser || (actingRole === UserRole.SUPERADMIN && isDemo === true),
      mustChangePassword: !isDemoUser, // Demo users don't need to change password, others must change temporary password
      isTemporaryAccount: (requestedRole === UserRole.TEACHER || (autoGenerated && !isDemoUser)), // All teacher passwords are temporary, or auto-generated passwords for other roles
      isActive: true
    });

    await userRepository.save(user);

    // If role is TEACHER, link to an existing teacher only (do not create placeholder "Teacher Account")
    if (requestedRole === UserRole.TEACHER) {
      const { Teacher } = await import('../entities/Teacher');
      const teacherRepository = AppDataSource.getRepository(Teacher);
      
      // Username must be the Employee Number (teacherId) of an existing teacher; match case-insensitively
      const teacher = await teacherRepository
        .createQueryBuilder('teacher')
        .leftJoinAndSelect('teacher.user', 'user')
        .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: baseUsername })
        .getOne();
      
      if (!teacher) {
        await userRepository.remove(user);
        return res.status(400).json({
          message: 'No teacher found with this Employee Number. Add the teacher first (Teachers → Add Teacher) and use their Employee Number as the username.',
          hint: 'Use the exact Employee Number (e.g. JPST1234567) of an existing teacher.'
        });
      }
      
      if (teacher.userId) {
        await userRepository.remove(user);
        return res.status(400).json({
          message: 'This teacher already has a user account.',
          hint: 'Use "Create Account" next to the teacher in the list instead.'
        });
      }
      
      teacher.userId = user.id;
      await teacherRepository.save(teacher);
      if (user.username !== teacher.teacherId) {
        user.username = teacher.teacherId;
        await userRepository.save(user);
      }
      console.log(`[CreateUserAccount] Linked existing teacher (${teacher.firstName} ${teacher.lastName}, teacherId: ${teacher.teacherId}) to user ${user.id}`);
    }

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

// Admin: Reset password for a user (teacher, parent, student, etc.)
export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = req.user.role;
    if (actingRole !== UserRole.ADMIN && actingRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Administrators can reset passwords' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { userId, newPassword } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ message: 'New password is required and must be at least 8 characters long' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent resetting demo user passwords
    if (user.isDemo) {
      return res.status(403).json({ message: 'Cannot reset password for demo accounts' });
    }

    // Hash and update password (trim to avoid whitespace issues)
    const trimmedPassword = newPassword.trim();
    console.log(`[ResetUserPassword] Resetting password for user ${user.id} (username: ${user.username}, role: ${user.role})`);
    console.log(`[ResetUserPassword] New password length: ${trimmedPassword.length}`);
    
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    console.log(`[ResetUserPassword] Password hashed successfully, hash length: ${hashedPassword.length}`);
    
    // Verify the hash was created successfully BEFORE saving
    const verifyHashBeforeSave = await bcrypt.compare(trimmedPassword, hashedPassword);
    if (!verifyHashBeforeSave) {
      console.error('[ResetUserPassword] ERROR: Password hash verification failed BEFORE saving!');
      return res.status(500).json({ message: 'Failed to hash password. Please try again.' });
    }
    console.log(`[ResetUserPassword] ✓ Hash verification BEFORE save: ${verifyHashBeforeSave}`);
    
    // Save the new password
    user.password = hashedPassword;
    user.mustChangePassword = true; // Require password change on next login
    user.isTemporaryAccount = true; // Mark as temporary so user must change it
    await userRepository.save(user);
    console.log(`[ResetUserPassword] User saved to database`);

    // CRITICAL: Reload user from database to ensure we have the latest password hash
    const reloadedUser = await userRepository.findOne({ where: { id: user.id } });
    if (!reloadedUser) {
      console.error('[ResetUserPassword] ERROR: Could not reload user after saving!');
      return res.status(500).json({ message: 'Failed to verify password reset. Please try again.' });
    }

    // Verify the password works with the reloaded user (from database)
    const verifyHashAfterSave = await bcrypt.compare(trimmedPassword, reloadedUser.password);
    if (!verifyHashAfterSave) {
      console.error('[ResetUserPassword] ERROR: Password hash verification failed AFTER saving and reloading!');
      console.error(`[ResetUserPassword] Original hash: ${hashedPassword.substring(0, 20)}...`);
      console.error(`[ResetUserPassword] Reloaded hash: ${reloadedUser.password.substring(0, 20)}...`);
      return res.status(500).json({ message: 'Password was saved but verification failed. Please contact administrator.' });
    }
    console.log(`[ResetUserPassword] ✓ Hash verification AFTER save and reload: ${verifyHashAfterSave}`);

    // For teachers, ensure username matches teacherId (fix if it doesn't)
    if (reloadedUser.role === UserRole.TEACHER) {
      const { Teacher } = await import('../entities/Teacher');
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = await teacherRepository.findOne({ where: { userId: reloadedUser.id } });
      if (teacher && teacher.teacherId) {
        console.log(`[ResetUserPassword] Teacher info - Employee Number: ${teacher.teacherId}, Current Username: ${reloadedUser.username}`);
        if (teacher.teacherId.toLowerCase() !== reloadedUser.username.toLowerCase()) {
          console.warn(`[ResetUserPassword] ⚠️  Username mismatch detected. Updating username from "${reloadedUser.username}" to "${teacher.teacherId}"`);
          reloadedUser.username = teacher.teacherId;
          await userRepository.save(reloadedUser);
          console.log(`[ResetUserPassword] ✓ Username updated to match Employee Number: ${teacher.teacherId}`);
        } else {
          console.log(`[ResetUserPassword] ✓ Username matches Employee Number`);
        }
      }
    }

    console.log(`[ResetUserPassword] ✓ Admin ${req.user.id} reset password for user ${reloadedUser.id} (username: ${reloadedUser.username}, role: ${reloadedUser.role})`);
    console.log(`[ResetUserPassword] Password reset complete and verified. User can now login with the new password.`);

    res.json({
      message: 'Password reset successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

// Admin/SuperAdmin: Update a user's role
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = req.user.role;
    if (actingRole !== UserRole.ADMIN && actingRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Administrators can change user roles' });
    }

    const userId = req.params.id;
    const { role: requestedRole } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!requestedRole || typeof requestedRole !== 'string') {
      return res.status(400).json({ message: 'Role is required' });
    }

    let role = String(requestedRole).trim().toLowerCase();
    if (role === 'demo-user') role = UserRole.DEMO_USER;
    if (!Object.values(UserRole).includes(role as UserRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Admin cannot set or change role to superadmin
    if (actingRole === UserRole.ADMIN && role === UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only a Super Admin can assign the Super Admin role' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role as UserRole;
    if (role === UserRole.DEMO_USER) {
      user.isDemo = true;
    } else if (user.isDemo && role !== UserRole.DEMO_USER) {
      user.isDemo = false;
    }

    await userRepository.save(user);

    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

// Get universal teacher account status (admin/superadmin only)
export const getUniversalTeacherStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only Administrators can view universal teacher status' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const [universalUser] = await userRepository.find({
      where: { role: UserRole.TEACHER, isUniversalTeacher: true },
      take: 1
    });

    const [settingsRow] = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const universalTeacherEnabled = settingsRow?.universalTeacherEnabled === true;

    res.json({
      exists: !!universalUser,
      username: universalUser?.username ?? UNIVERSAL_TEACHER_USERNAME,
      userId: universalUser?.id,
      universalTeacherEnabled
    });
  } catch (error: any) {
    console.error('Error getting universal teacher status:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Create universal teacher account (admin/superadmin only)
export const createUniversalTeacherAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only Administrators can create the universal teacher account' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const [settingsRow] = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    if (!settingsRow?.universalTeacherEnabled) {
      return res.status(400).json({
        message: 'Universal teacher is not enabled. Enable it in Settings → Module Access Control → Universal Teacher.'
      });
    }

    const existing = await userRepository.findOne({
      where: { role: UserRole.TEACHER, isUniversalTeacher: true }
    });
    if (existing) {
      return res.status(400).json({
        message: 'Universal teacher account already exists.',
        username: existing.username,
        userId: existing.id
      });
    }

    const { password, generatePassword = true } = req.body || {};
    let plainPassword = (password && String(password).trim()) || '';
    const autoGenerated = !plainPassword;
    if (autoGenerated) plainPassword = generateTemporaryPassword();
    if (plainPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const username = UNIVERSAL_TEACHER_USERNAME;

    const user = userRepository.create({
      email: null,
      username,
      password: hashedPassword,
      role: UserRole.TEACHER,
      isUniversalTeacher: true,
      isActive: true,
      mustChangePassword: true,
      isTemporaryAccount: true,
      isDemo: false
    });
    await userRepository.save(user);

    res.status(201).json({
      message: 'Universal teacher account created successfully. Share the credentials with teachers for testing.',
      user: { id: user.id, username: user.username, role: user.role, isUniversalTeacher: true },
      temporaryCredentials: autoGenerated ? { password: plainPassword } : undefined
    });
  } catch (error: any) {
    console.error('Error creating universal teacher account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

