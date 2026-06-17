import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Teacher } from '../entities/Teacher';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { IsNull, Not } from 'typeorm';
import { isFullAccessRole } from '../constants/userRoles';

const canManageUserAccounts = (role: UserRole): boolean =>
  role === UserRole.ADMIN || isFullAccessRole(role);

/** Username for the shared Head Teacher (universal teacher) account */
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

    const updatingPassword = !!newPassword;
    const updatingUsername = newUsername !== undefined && newUsername !== null;
    const updatingEmail = newEmail !== undefined && newEmail !== null;
    if (!currentPassword && (updatingPassword || updatingUsername || updatingEmail)) {
      return res.status(400).json({ message: 'Current password is required to update your account' });
    }
    if (!updatingPassword && !updatingUsername && !updatingEmail) {
      return res.status(400).json({ message: 'Provide new password, new username, or new email to update' });
    }
    // Relaxed password policy for teachers and parents: allow any non-empty string.
    if (updatingPassword) {
      const pwd = String(newPassword ?? '');
      if (!pwd.trim()) {
        return res.status(400).json({ message: 'New password is required' });
      }
      // Keep stronger policy for admin/superadmin/accountant only
      const role = req.user?.role;
      if (
        (role === UserRole.ADMIN ||
          isFullAccessRole(role) ||
          role === UserRole.ACCOUNTANT ||
          role === UserRole.HEADMASTER ||
          role === UserRole.DEPUTY_HEADMASTER) &&
        pwd.length < 8
      ) {
        return res.status(400).json({ message: 'New password must be at least 8 characters long' });
      }
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (currentPassword) {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
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
    if (newUsername !== undefined && newUsername !== null && user.role !== UserRole.TEACHER) {
      const trimmed = String(newUsername).trim();
      if (trimmed) user.username = trimmed;
    }

    // Update email if provided
    if (newEmail !== undefined && newEmail !== null) {
      const trimmed = String(newEmail).trim();
      user.email = trimmed || null;
    }

    if (firstName !== undefined) user.firstName = firstName ? String(firstName).trim() || null : null;
    if (lastName !== undefined) user.lastName = lastName ? String(lastName).trim() || null : null;

    if (updatingPassword) {
      user.password = await bcrypt.hash(newPassword, 10);
      user.mustChangePassword = false;
      user.isTemporaryAccount = false;
    }

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

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined;
    const payload: Record<string, unknown> = {
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
    };

    // Only load profile relations when needed (avoids slow/hanging joins for staff logins)
    if (user.role === UserRole.TEACHER) {
      const withTeacher = await userRepository.findOne({
        where: { id: userId },
        relations: ['teacher'],
      });
      payload.teacher = withTeacher?.teacher ?? null;
    } else if (user.role === UserRole.PARENT) {
      const withParent = await userRepository.findOne({
        where: { id: userId },
        relations: ['parent'],
      });
      payload.parent = withParent?.parent ?? null;
    } else if (user.role === UserRole.STUDENT) {
      const withStudent = await userRepository.findOne({
        where: { id: userId },
        relations: ['student'],
      });
      payload.student = withStudent?.student ?? null;
    }

    res.json(payload);
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
    if (!canManageUserAccounts(actingRole)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can create user accounts' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      email,
      username,
      firstName,
      lastName,
      role,
      password,
      generatePassword = true,
      isDemo = false
    } = req.body || {};

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    
    if (!username || !String(username).trim()) {
      return res.status(400).json({ message: 'Username is required for login' });
    }

    const trimmedFirstName = firstName ? String(firstName).trim() : '';
    const trimmedLastName = lastName ? String(lastName).trim() : '';
    if (requestedRole !== UserRole.TEACHER) {
      if (!trimmedFirstName) {
        return res.status(400).json({ message: 'First name is required' });
      }
      if (!trimmedLastName) {
        return res.status(400).json({ message: 'Last name is required' });
      }
    }

    const useGeneratedPassword =
      generatePassword === true || generatePassword === 'true' || generatePassword === 1;
    if (!useGeneratedPassword && (!password || !String(password).trim())) {
      return res.status(400).json({ message: 'Password is required' });
    }
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (
      actingRole === UserRole.ADMIN &&
      requestedRole === UserRole.SUPERADMIN
    ) {
      return res.status(403).json({
        message: 'Only a Super Administrator or Director can create Super Administrator accounts',
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    const MAX_SUPERADMIN = 2;
    const MAX_ADMIN = 2;

    if (requestedRole === UserRole.SUPERADMIN) {
      const superadminCount = await userRepository.count({ where: { role: UserRole.SUPERADMIN } });
      if (superadminCount >= MAX_SUPERADMIN) {
        return res.status(400).json({ message: `Maximum of ${MAX_SUPERADMIN} Super Admin accounts allowed.` });
      }
    }
    const MAX_DIRECTOR = 2;
    if (requestedRole === UserRole.DIRECTOR) {
      const directorCount = await userRepository.count({ where: { role: UserRole.DIRECTOR } });
      if (directorCount >= MAX_DIRECTOR) {
        return res.status(400).json({ message: `Maximum of ${MAX_DIRECTOR} Director accounts allowed.` });
      }
    }
    if (requestedRole === UserRole.ADMIN) {
      const adminCount = await userRepository.count({ where: { role: UserRole.ADMIN } });
      if (adminCount >= MAX_ADMIN) {
        return res.status(400).json({ message: `Maximum of ${MAX_ADMIN} Administrator accounts allowed.` });
      }
    }

    // Only check email if provided (not required for teachers)
    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const existingByEmail = await userRepository.findOne({ where: { email: trimmedEmail } });
      if (existingByEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    let finalUsername = String(username).replace(/\s+/g, '').toLowerCase();
    if (!finalUsername) {
      return res.status(400).json({ message: 'Username is required for login' });
    }
    
    // Ensure username is unique
    const baseUsername = finalUsername;
    let suffix = 1;
    let usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    while (usernameExists) {
      finalUsername = `${baseUsername}${suffix++}`;
      usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    }

    let plainPassword = password ? String(password).trim() : '';
    let autoGenerated = false;
    if (useGeneratedPassword || !plainPassword) {
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
      email: email ? String(email).trim().toLowerCase() : null,
      username: finalUsername,
      firstName: trimmedFirstName || null,
      lastName: trimmedLastName || null,
      password: hashedPassword,
      role: requestedRole,
      isDemo: isDemoUser || (isFullAccessRole(actingRole) && isDemo === true),
      mustChangePassword: !isDemoUser && autoGenerated,
      isTemporaryAccount:
        requestedRole === UserRole.TEACHER || (autoGenerated && !isDemoUser),
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
        firstName: user.firstName,
        lastName: user.lastName,
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
    if (!canManageUserAccounts(actingRole)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can reset passwords' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { userId, newPassword, generatePassword } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
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

    let trimmedPassword: string;
    if (generatePassword) {
      trimmedPassword = generateTemporaryPassword();
    } else {
      if (!newPassword || newPassword.trim().length < 8) {
        return res.status(400).json({ message: 'New password is required and must be at least 8 characters long' });
      }
      trimmedPassword = newPassword.trim();
    }
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
    const isGenerated = generatePassword === true || generatePassword === 'true' || generatePassword === 1;
    if (isGenerated) {
      user.mustChangePassword = true;
      user.isTemporaryAccount = true;
    } else {
      // Manual admin-set password: user signs in with it and may change later from My Account
      user.mustChangePassword = false;
      user.isTemporaryAccount = false;
    }
    (user as any).failedLoginAttempts = 0;
    (user as any).lockedUntil = null;
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

    const payload: any = {
      message: 'Password reset successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };
    if (isGenerated) {
      payload.temporaryPassword = trimmedPassword;
      payload.mustChangeOnFirstLogin = true;
    } else {
      payload.mustChangeOnFirstLogin = false;
      payload.message = 'Password set successfully. User can change it later from My Account.';
    }
    res.json(payload);
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

// Admin/SuperAdmin: Delete a user account (unlink from teacher/parent/student, then remove user)
export const deleteUserAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const actingRole = req.user.role;
    if (!canManageUserAccounts(actingRole)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can delete user accounts' });
    }

    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.id === userId) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    if (user.role === UserRole.SUPERADMIN) {
      const superadminCount = await userRepository.count({ where: { role: UserRole.SUPERADMIN } });
      if (superadminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last Super Admin account' });
      }
    }
    if (!isFullAccessRole(actingRole) && isFullAccessRole(user.role)) {
      return res.status(403).json({ message: 'Only a Super Admin can delete a Super Admin account' });
    }

    const { Teacher } = await import('../entities/Teacher');
    const { Parent } = await import('../entities/Parent');
    const { Student } = await import('../entities/Student');
    const teacherRepo = AppDataSource.getRepository(Teacher);
    const parentRepo = AppDataSource.getRepository(Parent);
    const studentRepo = AppDataSource.getRepository(Student);

    await teacherRepo.update({ userId }, { userId: null as any });
    await parentRepo.update({ userId }, { userId: null as any });
    await studentRepo.update({ userId }, { userId: null as any });

    await userRepository.remove(user);

    res.json({ message: 'Account deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Admin/SuperAdmin: Update a user's role
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = req.user.role;
    if (!canManageUserAccounts(actingRole)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can change user roles' });
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

    // Admin cannot assign Super Admin; Director may be created/assigned by Administrators
    if (actingRole === UserRole.ADMIN && role === UserRole.SUPERADMIN) {
      return res.status(403).json({
        message: 'Only a Super Administrator or Director can assign the Super Administrator role',
      });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentRole = user.role as UserRole;

    // Non-SuperAdmins cannot modify SuperAdmin accounts
    if (isFullAccessRole(currentRole) && !isFullAccessRole(actingRole)) {
      return res.status(403).json({ message: 'Only a Super Admin can modify a Super Admin account' });
    }

    const MAX_SUPERADMIN = 2;
    const MAX_ADMIN = 2;

    const superadminCount = await userRepository.count({ where: { role: UserRole.SUPERADMIN } });
    const adminCount = await userRepository.count({ where: { role: UserRole.ADMIN } });

    if (
      role === UserRole.SUPERADMIN &&
      !isFullAccessRole(currentRole) &&
      superadminCount >= MAX_SUPERADMIN
    ) {
      return res.status(400).json({ message: `Maximum of ${MAX_SUPERADMIN} Super Admin accounts allowed.` });
    }
    if (role === UserRole.ADMIN && currentRole !== UserRole.ADMIN && adminCount >= MAX_ADMIN) {
      return res.status(400).json({ message: `Maximum of ${MAX_ADMIN} Administrator accounts allowed.` });
    }

    if (isFullAccessRole(currentRole) && !isFullAccessRole(role) && superadminCount <= 1) {
      return res.status(400).json({ message: 'Cannot change role of the last Super Admin account' });
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

// Admin/SuperAdmin: Update another staff user's username and/or email
export const updateStaffProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can update staff profile' });
    }
    const targetUserId = req.params.id;
    const { username: newUsername, email: newEmail } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: targetUserId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const staffRoles = [
      UserRole.ADMIN,
      UserRole.SUPERADMIN,
      UserRole.DIRECTOR,
      UserRole.HEADMASTER,
      UserRole.DEPUTY_HEADMASTER,
      UserRole.ACCOUNTANT,
    ];
    if (!staffRoles.includes(user.role as UserRole)) {
      return res.status(400).json({ message: 'Only staff accounts can be updated here' });
    }
    if (isFullAccessRole(user.role) && !isFullAccessRole(req.user.role)) {
      return res.status(403).json({ message: 'Only a Super Admin can update a Super Admin profile' });
    }

    const updatingUsername = newUsername !== undefined && newUsername !== null;
    const updatingEmail = newEmail !== undefined && newEmail !== null;
    if (!updatingUsername && !updatingEmail) {
      return res.status(400).json({ message: 'Provide username and/or email to update' });
    }

    if (updatingUsername) {
      const trimmed = String(newUsername).trim();
      if (!trimmed) {
        return res.status(400).json({ message: 'Username cannot be empty' });
      }
      if (trimmed !== user.username) {
        const existing = await userRepository.findOne({ where: { username: trimmed } });
        if (existing) {
          return res.status(400).json({ message: 'Username already exists' });
        }
        (user as any).username = trimmed;
      }
    }
    if (updatingEmail) {
      const trimmed = String(newEmail).trim().toLowerCase() || null;
      if (trimmed !== (user.email || null)) {
        if (trimmed) {
          const existing = await userRepository.findOne({ where: { email: trimmed } });
          if (existing) {
            return res.status(400).json({ message: 'Email already exists' });
          }
        }
        (user as any).email = trimmed;
      }
    }

    await userRepository.save(user);
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error updating staff profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Resolve display name for user management list */
function resolveUserDisplayName(u: User & { teacher?: any; student?: any; parent?: any }): string {
  const fromUser = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (fromUser) return fromUser;
  if (u.teacher) {
    const t = [u.teacher.firstName, u.teacher.lastName].filter(Boolean).join(' ').trim();
    if (t) return t;
  }
  if (u.student) {
    const s = [u.student.firstName, u.student.lastName].filter(Boolean).join(' ').trim();
    if (s) return s;
  }
  if (u.parent) {
    const p = [u.parent.firstName, u.parent.lastName].filter(Boolean).join(' ').trim();
    if (p) return p;
  }
  return u.username || u.email || '—';
}

function resolveUserStatus(u: User): 'Active' | 'Locked' | 'Inactive' {
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    return 'Locked';
  }
  if (u.isActive === false) {
    return 'Inactive';
  }
  return 'Active';
}

// List all user accounts for User Management page
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can list user accounts' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const users = await userRepository.find({
      order: { createdAt: 'DESC' }
    });

    const userIds = users.map((u) => u.id);
    let teachers: Teacher[] = [];
    let students: Student[] = [];
    let parents: Parent[] = [];

    if (userIds.length > 0) {
      const teacherRepo = AppDataSource.getRepository(Teacher);
      const studentRepo = AppDataSource.getRepository(Student);
      const parentRepo = AppDataSource.getRepository(Parent);
      [teachers, students, parents] = await Promise.all([
        teacherRepo
          .createQueryBuilder('t')
          .where('t.userId IN (:...ids)', { ids: userIds })
          .getMany(),
        studentRepo
          .createQueryBuilder('s')
          .where('s.userId IN (:...ids)', { ids: userIds })
          .getMany(),
        parentRepo
          .createQueryBuilder('p')
          .where('p.userId IN (:...ids)', { ids: userIds })
          .getMany()
      ]);
    }

    const teacherByUserId = new Map(teachers.map((t) => [t.userId, t]));
    const studentByUserId = new Map(students.map((s) => [s.userId, s]));
    const parentByUserId = new Map(parents.map((p) => [p.userId, p]));

    const list = users.map((u) => {
      const enriched = {
        ...u,
        teacher: teacherByUserId.get(u.id),
        student: studentByUserId.get(u.id),
        parent: parentByUserId.get(u.id)
      };
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        name: resolveUserDisplayName(enriched),
        role: u.role,
        status: resolveUserStatus(u),
        isLocked: u.lockedUntil ? new Date(u.lockedUntil) > new Date() : false,
        isDemo: u.isDemo,
        createdAt: u.createdAt
      };
    });

    res.json({ users: list });
  } catch (error: any) {
    console.error('Error listing all users:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// List staff users (admin, superadmin, accountant) for manage-accounts page
export const getStaffUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can list staff accounts' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const staffRoles = [
      UserRole.ADMIN,
      UserRole.SUPERADMIN,
      UserRole.DIRECTOR,
      UserRole.HEADMASTER,
      UserRole.DEPUTY_HEADMASTER,
      UserRole.ACCOUNTANT,
    ];
    const users = await userRepository
      .createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles: staffRoles })
      .orderBy("CASE WHEN u.role = 'superadmin' THEN 1 WHEN u.role = 'admin' THEN 2 ELSE 3 END")
      .addOrderBy('u.username')
      .getMany();

    const list = users.map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      failedLoginAttempts: u.failedLoginAttempts ?? 0,
      lockedUntil: u.lockedUntil,
      isLocked: u.lockedUntil ? new Date(u.lockedUntil) > new Date() : false
    }));

    res.json({ users: list });
  } catch (error: any) {
    console.error('Error listing staff users:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Unlock a staff account (clear failed attempts and lock)
export const unlockUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can unlock accounts' });
    }
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const staffRoles = [
      UserRole.ADMIN,
      UserRole.SUPERADMIN,
      UserRole.DIRECTOR,
      UserRole.HEADMASTER,
      UserRole.DEPUTY_HEADMASTER,
      UserRole.ACCOUNTANT,
    ];
    if (!staffRoles.includes(user.role)) {
      return res.status(400).json({ message: 'Only staff accounts (administrator, superadmin, accountant) can be unlocked' });
    }
    if (isFullAccessRole(user.role) && !isFullAccessRole(req.user.role)) {
      return res.status(403).json({ message: 'Only a Super Admin can unlock a Super Admin account' });
    }

    (user as any).failedLoginAttempts = 0;
    (user as any).lockedUntil = null;
    await userRepository.save(user);

    res.json({ message: 'Account unlocked successfully', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error: any) {
    console.error('Error unlocking user:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get universal teacher account status (admin/superadmin only)
export const getUniversalTeacherStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can view universal teacher status' });
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
    if (!req.user || !canManageUserAccounts(req.user.role)) {
      return res.status(403).json({ message: 'Only Administrators or Directors can create the Head Teacher account' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const [settingsRow] = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    if (!settingsRow?.universalTeacherEnabled) {
      return res.status(400).json({
        message: 'Head Teacher account is not enabled. Enable it in Settings → Module Access Control → Head Teacher.'
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

