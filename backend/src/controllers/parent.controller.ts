import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { Parent } from '../entities/Parent';
import { Student } from '../entities/Student';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { parseAmount } from '../utils/numberUtils';
import { computeInvoiceFeesOutstanding, getConfiguredDeskFee } from '../utils/invoiceFeesBalance';
import { ParentStudent } from '../entities/ParentStudent';
import { validatePhoneNumber } from '../utils/phoneValidator';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User, UserRole } from '../entities/User';
import { UserSessionLog } from '../entities/UserSessionLog';
import { isPreviewingRole, previewParentProfile } from '../utils/viewAsRole';

const generateTemporaryPassword = () => {
  return `Temp-${randomBytes(4).toString('hex')}-${Date.now().toString().slice(-4)}`;
};

const EMAIL_ALREADY_EXISTS_MESSAGE =
  'This email address is already registered. Please use a different email or reset the existing parent account.';

async function findParentAndUserByEmail(email: string): Promise<{ parent: Parent | null; user: User | null }> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return { parent: null, user: null };
  }

  const parentRepository = AppDataSource.getRepository(Parent);
  const userRepository = AppDataSource.getRepository(User);

  const parent = await parentRepository
    .createQueryBuilder('parent')
    .where('LOWER(TRIM(parent.email)) = :email', { email: normalized })
    .getOne();

  const user = await userRepository
    .createQueryBuilder('user')
    .where('LOWER(TRIM(user.email)) = :email', { email: normalized })
    .getOne();

  return { parent, user };
}

async function resolveStudentForParentMode(req: AuthRequest): Promise<Student | null> {
  if (!req.user) return null;

  if (req.user.role !== UserRole.STUDENT) return null;

  let student = req.user.student as Student | undefined;
  if (!student) {
    const studentRepo = AppDataSource.getRepository(Student);
    student =
      (await studentRepo.findOne({
        where: { user: { id: req.user.id } },
        relations: ['user'],
      })) ||
      (await studentRepo.findOne({
        where: { studentNumber: req.user.username },
        relations: ['user'],
      })) ||
      undefined;
  }
  return student || null;
}

async function resolveParentForRequest(req: AuthRequest): Promise<Parent | null> {
  if (!req.user) return null;
  const parentRepository = AppDataSource.getRepository(Parent);

  // Student acting as a linked parent (Parent Portal from student dashboard)
  const actingParentId = String((req.headers['x-parent-id'] as any) || '').trim();
  if (actingParentId && req.user.role === UserRole.STUDENT) {
    const student = await resolveStudentForParentMode(req);
    if (!student) return null;

    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const link = await parentStudentRepository.findOne({
      where: { parentId: actingParentId, studentId: student.id },
    });
    if (!link) return null;

    const parent = await parentRepository.findOne({
      where: { id: actingParentId },
    });
    return parent || null;
  }

  // Normal parent flow — prefer JWT relation, then Parent.userId, then email match
  let parent = req.user?.parent || null;
  if (!parent) {
    parent = await parentRepository.findOne({ where: { userId: req.user.id } });
  }
  if (!parent && req.user.email) {
    parent = await parentRepository.findOne({
      where: { email: String(req.user.email).trim().toLowerCase() },
    });
  }
  return parent || null;
}

function serializeLinkedStudentForParent(
  link: ParentStudent,
  termBalance: number,
  currentBalance: number
) {
  const student = link.student;
  const cls = student?.classEntity;
  const classDto = cls
    ? { id: cls.id, name: cls.name, form: (cls as any).form ?? null }
    : null;

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    studentNumber: student.studentNumber,
    dateOfBirth: student.dateOfBirth ?? null,
    gender: student.gender ?? null,
    studentStatus: student.studentStatus ?? null,
    address: student.address ?? null,
    phoneNumber: student.phoneNumber ?? null,
    contactNumber: (student as any).contactNumber ?? student.phoneNumber ?? null,
    studentType: student.studentType ?? null,
    usesTransport: !!(student as any).usesTransport,
    usesDiningHall: !!(student as any).usesDiningHall,
    isActive: student.isActive,
    classId: student.classId ?? null,
    classLevel: student.classLevel ?? null,
    grade: (student as any).grade ?? null,
    uniformBalance: Math.max(0, parseFloat(parseAmount((student as any).uniformBalance ?? 0).toFixed(2))),
    class: classDto,
    classEntity: classDto,
    termBalance,
    currentInvoiceBalance: currentBalance,
    relationshipType: link.relationshipType,
    parentStudentLinkId: link.id,
  };
}

// Get current parent's profile
export const getCurrentParentProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (isPreviewingRole(req, UserRole.PARENT)) {
      return res.json(previewParentProfile());
    }

    const parent = await resolveParentForRequest(req);

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    res.json({
      id: parent.id,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phoneNumber: parent.phoneNumber,
      address: parent.address,
      gender: parent.gender || null,
      fullName: `${parent.lastName || ''} ${parent.firstName || ''}`.trim()
    });
  } catch (error: any) {
    console.error('Error getting parent profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get parent's linked students
export const getParentStudents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (isPreviewingRole(req, UserRole.PARENT)) {
      return res.json({ students: [] });
    }

    const requestedTermRaw = (req.query as any)?.term;
    const requestedTerm = typeof requestedTermRaw === 'string' ? requestedTermRaw.trim() : '';

    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const parent = await resolveParentForRequest(req);

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const links = await parentStudentRepository.find({
      where: { parentId: parent.id },
      relations: ['student', 'student.classEntity']
    });

    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const activeTerm = (settings?.activeTerm || settings?.currentTerm || '').toString().trim();
    const termToUse = requestedTerm || activeTerm;

    // Get invoice balances for each student
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentsWithBalances = await Promise.all(
      (links || []).map(async (link) => {
        const student = link.student;
        // Use the latest invoice for the requested/current term.
        // This prevents showing next-term tuition in balances when only the current term is relevant (e.g., Mid Term).
        const latestInvoice = termToUse
          ? await invoiceRepository.findOne({
              where: { studentId: student.id, term: termToUse, isVoided: false },
              order: { createdAt: 'DESC' }
            })
          : await invoiceRepository.findOne({
              where: { studentId: student.id, isVoided: false },
              order: { createdAt: 'DESC' }
            });

        const deskFeeLinked = getConfiguredDeskFee(settings);
        const feesLinked = (settings as any)?.feesSettings || {};
        const transportCostLinked = parseFloat(String(feesLinked.transportCost ?? 0)) || 0;
        const diningHallCostLinked = parseFloat(String(feesLinked.diningHallCost ?? 0)) || 0;
        let termBalance = 0;
        let currentBalance = 0;
        if (latestInvoice) {
          termBalance = computeInvoiceFeesOutstanding(latestInvoice, student, deskFeeLinked, {
            transportCost: transportCostLinked,
            diningHallCost: diningHallCostLinked
          });
          currentBalance = termBalance;
        }

        return serializeLinkedStudentForParent(link, termBalance, currentBalance);
      })
    );

    res.json({ students: studentsWithBalances });
  } catch (error: any) {
    console.error('Error getting parent students:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminCreateParent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      address,
      gender,
      createAccount = true,
      password,
      generatePassword = true
    } = req.body || {};

    const trimmedEmail = String(email || '').trim().toLowerCase();
    if (!firstName || !lastName || !trimmedEmail) {
      return res.status(400).json({ message: 'First name, last name, and email are required' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const userRepository = AppDataSource.getRepository(User);

    const { parent: existingParent, user: existingUserByEmail } = await findParentAndUserByEmail(trimmedEmail);
    if (existingParent || existingUserByEmail) {
      return res.status(400).json({
        message: EMAIL_ALREADY_EXISTS_MESSAGE,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    let normalizedPhone: string | null = null;
    if (phoneNumber && String(phoneNumber).trim()) {
      const phoneValidation = validatePhoneNumber(String(phoneNumber).trim(), false);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
      }
      normalizedPhone = phoneValidation.normalized || String(phoneNumber).trim();
    }

    let createdUser: User | null = null;
    let plainPassword = '';

    if (createAccount) {
      const passwordFromRequest = String(password || '').trim();
      if (passwordFromRequest) {
        plainPassword = passwordFromRequest;
      } else if (generatePassword) {
        plainPassword = generateTemporaryPassword();
      } else {
        return res.status(400).json({ message: 'Password is required when generatePassword is false' });
      }

      if (plainPassword.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      const baseUsername = trimmedEmail.split('@')[0].replace(/\s+/g, '').toLowerCase() || `parent_${Date.now()}`;
      let finalUsername = baseUsername;
      let suffix = 1;
      // Ensure username is unique
      // eslint-disable-next-line no-await-in-loop
      while (await userRepository.findOne({ where: { username: finalUsername } })) {
        finalUsername = `${baseUsername}${suffix++}`;
      }

      createdUser = userRepository.create({
        email: trimmedEmail,
        username: finalUsername,
        password: hashedPassword,
        role: UserRole.PARENT,
        isDemo: false,
        mustChangePassword: true,
        isTemporaryAccount: true,
        isActive: true,
        firstName: String(firstName).trim() || null,
        lastName: String(lastName).trim() || null
      });
      await userRepository.save(createdUser);
    }

    const parent = parentRepository.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: trimmedEmail,
      phoneNumber: normalizedPhone,
      address: address ? String(address).trim() || null : null,
      gender: gender ? String(gender).trim() || null : null,
      userId: createdUser ? createdUser.id : null
    });
    await parentRepository.save(parent);

    res.status(201).json({
      message: 'Parent created successfully',
      parent,
      user: createdUser
        ? {
            id: createdUser.id,
            email: createdUser.email,
            username: createdUser.username,
            role: createdUser.role
          }
        : undefined,
      temporaryCredentials: createdUser ? { password: plainPassword } : undefined
    });
  } catch (error: any) {
    console.error('Error creating parent (admin):', error);
    if (error?.code === '23505') {
      return res.status(400).json({
        message: EMAIL_ALREADY_EXISTS_MESSAGE,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminResetParentPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { email, newPassword, generatePassword = true } = req.body || {};
    const trimmedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const parentRepository = AppDataSource.getRepository(Parent);

    let user = await userRepository.findOne({ where: { email: trimmedEmail } });

    if (!user) {
      user = await userRepository.findOne({ where: { username: trimmedEmail } });
    }

    if (!user) {
      const parent = await parentRepository.findOne({ where: { email: trimmedEmail } });
      if (parent?.userId) {
        user = await userRepository.findOne({ where: { id: parent.userId } });
      }
    }

    if (!user) {
      return res.status(404).json({ message: 'No user account found for that email' });
    }

    if (user.role !== UserRole.PARENT) {
      return res.status(400).json({ message: 'This email does not belong to a parent account' });
    }

    if (user.isDemo) {
      return res.status(403).json({ message: 'Cannot reset password for demo accounts' });
    }

    let plainPassword = String(newPassword || '').trim();
    if (!plainPassword) {
      if (generatePassword) {
        plainPassword = generateTemporaryPassword();
      } else {
        return res.status(400).json({ message: 'New password is required when generatePassword is false' });
      }
    }

    // Relaxed password policy for parents: allow any non-empty string.
    if (!plainPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    user.password = await bcrypt.hash(plainPassword, 10);
    user.mustChangePassword = true;
    user.isTemporaryAccount = true;
    await userRepository.save(user);

    res.json({
      message: 'Password reset successfully',
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      temporaryCredentials: { password: plainPassword }
    });
  } catch (error: any) {
    console.error('Error resetting parent password (admin):', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Link a student to parent
export const linkStudent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const studentRepository = AppDataSource.getRepository(Student);

    let parent = req.user?.parent || null;
    if (!parent) {
      parent = await parentRepository.findOne({ where: { userId } });
    }
    if (!parent) {
      const user = req.user;
      const newParent = parentRepository.create({
        firstName: '',
        lastName: '',
        phoneNumber: null,
        address: null,
        email: user?.email || null,
        userId: userId
      });
      parent = await parentRepository.save(newParent);
      if (user) {
        user.parent = parent;
      }
    }

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const existingLink = await parentStudentRepository.findOne({
      where: { parentId: parent.id, studentId: student.id }
    });

    if (existingLink) {
      return res.status(400).json({ message: 'Student is already linked to this parent' });
    }

    const link = parentStudentRepository.create({
      parentId: parent.id,
      studentId: student.id,
      relationshipType: 'guardian'
    });
    await parentStudentRepository.save(link);

    if (!student.parentId) {
      student.parentId = parent.id;
      await studentRepository.save(student);
    }

    res.json({ message: 'Student linked successfully', student, link });
  } catch (error: any) {
    console.error('Error linking student:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Unlink a student from parent
export const unlinkStudent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const studentRepository = AppDataSource.getRepository(Student);

    let parent = req.user?.parent || null;
    if (!parent) {
      parent = await parentRepository.findOne({ where: { userId } });
    }
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const link = await parentStudentRepository.findOne({
      where: { parentId: parent.id, studentId: student.id }
    });

    if (!link) {
      return res.status(403).json({ message: 'Student is not linked to this parent' });
    }

    await parentStudentRepository.remove(link);

    if (student.parentId === parent.id) {
      const remainingLinks = await parentStudentRepository.find({
        where: { studentId: student.id }
      });
      if (remainingLinks.length === 0) {
        student.parentId = null;
      } else {
        student.parentId = remainingLinks[0].parentId;
      }
      await studentRepository.save(student);
    }

    res.json({ message: 'Student unlinked successfully' });
  } catch (error: any) {
    console.error('Error unlinking student:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Link a student to parent by Student ID (studentNumber); DOB is optional (if provided, it is verified)
export const linkStudentByIdAndDob = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId, dateOfBirth } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const studentRepository = AppDataSource.getRepository(Student);

    let parent = req.user?.parent || null;
    if (!parent) {
      parent = await parentRepository.findOne({ where: { userId } });
    }
    if (!parent) {
      const user = req.user;
      const newParent = parentRepository.create({
        firstName: '',
        lastName: '',
        phoneNumber: null,
        address: null,
        email: user?.email || null,
        userId: userId
      });
      parent = await parentRepository.save(newParent);
      if (user) {
        user.parent = parent;
      }
    }

    // Find student by studentNumber (Student ID)
    const student = await studentRepository.findOne({
      where: { studentNumber: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found. Please check the Student ID.' });
    }

    // If Date of Birth was provided, verify it matches
    if (dateOfBirth) {
      const studentDob = new Date(student.dateOfBirth);
      const providedDob = new Date(dateOfBirth);
      const studentDobDate = new Date(studentDob.getFullYear(), studentDob.getMonth(), studentDob.getDate());
      const providedDobDate = new Date(providedDob.getFullYear(), providedDob.getMonth(), providedDob.getDate());
      if (studentDobDate.getTime() !== providedDobDate.getTime()) {
        return res.status(400).json({ message: 'Date of Birth does not match. Please verify the information.' });
      }
    }

    const existingLink = await parentStudentRepository.findOne({
      where: { parentId: parent.id, studentId: student.id }
    });

    if (existingLink) {
      return res.status(400).json({ message: 'Student is already linked to your account' });
    }

    const link = parentStudentRepository.create({
      parentId: parent.id,
      studentId: student.id,
      relationshipType: 'guardian'
    });
    await parentStudentRepository.save(link);

    if (!student.parentId) {
      student.parentId = parent.id;
      await studentRepository.save(student);
    }

    res.json({ 
      message: 'Student linked successfully', 
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentNumber: student.studentNumber,
        class: student.classEntity,
        relationshipType: link.relationshipType
      }
    });
  } catch (error: any) {
    console.error('Error linking student by ID and DOB:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Search students for linking (by student number or name)
export const searchStudents = async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const q = String(query).trim();
    if (q.length < 2) {
      return res.status(400).json({ message: 'Enter at least 2 characters to search' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const qb = studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.classEntity', 'classEntity');

    const likePattern = `%${q}%`;
    const nameParts = q.split(/\s+/).filter(Boolean);

    if (nameParts.length >= 2) {
      qb.where(
        '(student.firstName ILIKE :firstPart AND student.lastName ILIKE :lastPart)',
        { firstPart: `%${nameParts[0]}%`, lastPart: `%${nameParts.slice(1).join(' ')}%` }
      );
    } else if (/^[a-zA-Z0-9-]+$/.test(q)) {
      qb.where(
        '(student.studentNumber ILIKE :prefix OR student.firstName ILIKE :like OR student.lastName ILIKE :like)',
        { prefix: `${q}%`, like: likePattern }
      );
    } else {
      qb.where(
        '(student.studentNumber ILIKE :like OR student.firstName ILIKE :like OR student.lastName ILIKE :like)',
        { like: likePattern }
      );
    }

    const students = await qb
      .orderBy('student.lastName', 'ASC')
      .addOrderBy('student.firstName', 'ASC')
      .limit(20)
      .getMany();

    res.json({ students });
  } catch (error: any) {
    console.error('Error searching students:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminUpdateParent = async (req: AuthRequest, res: Response) => {
  try {
    const { parentId } = req.params;
    const { firstName, lastName, phoneNumber, address, email, gender } = req.body;

    if (!parentId) {
      return res.status(400).json({ message: 'Parent ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);

    const parent = await parentRepository.findOne({
      where: { id: parentId },
      relations: ['parentStudents', 'parentStudents.student', 'parentStudents.student.classEntity']
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    let normalizedPhone: string | null = null;
    if (phoneNumber && String(phoneNumber).trim()) {
      const phoneResult = validatePhoneNumber(String(phoneNumber), false);
      if (!phoneResult.isValid) {
        return res.status(400).json({ message: phoneResult.error || 'Invalid phone number' });
      }
      normalizedPhone = phoneResult.normalized || String(phoneNumber).trim();
    }

    parent.firstName = String(firstName).trim();
    parent.lastName = String(lastName).trim();
    parent.phoneNumber = normalizedPhone;
    parent.address = address && String(address).trim() ? String(address).trim() : null;
    parent.email = email && String(email).trim() ? String(email).trim() : null;
    parent.gender = gender && String(gender).trim() ? String(gender).trim() : null;

    const savedParent = await parentRepository.save(parent);

    res.json({
      message: 'Parent updated successfully',
      parent: savedParent
    });
  } catch (error: any) {
    console.error('Error updating parent (admin):', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminDeleteParent = async (req: AuthRequest, res: Response) => {
  try {
    const { parentId } = req.params;

    if (!parentId) {
      return res.status(400).json({ message: 'Parent ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const studentRepository = AppDataSource.getRepository(Student);

    const parent = await parentRepository.findOne({ where: { id: parentId } });

    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const linkedCount = await parentStudentRepository.count({
      where: { parentId: parent.id }
    });

    const directStudentsCount = await studentRepository.count({
      where: { parentId: parent.id }
    });

    if (linkedCount > 0 || directStudentsCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete parent with linked students. Unlink all students first.'
      });
    }

    await parentRepository.remove(parent);

    res.json({ message: 'Parent deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting parent (admin):', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Search parent emails by fragment (for admin reset password autocomplete). Returns parents with email matching search. */
export const adminSearchParentEmails = async (req: AuthRequest, res: Response) => {
  try {
    const search = typeof (req.query as any).search === 'string' ? (req.query as any).search.trim() : '';
    if (!search || search.length < 2) {
      return res.json({ parents: [] });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const parents = await parentRepository
      .createQueryBuilder('p')
      .select(['p.id', 'p.email', 'p.firstName', 'p.lastName'])
      .where('p.email IS NOT NULL AND p.email != :empty', { empty: '' })
      .andWhere('LOWER(p.email) LIKE LOWER(:q)', { q: `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%` })
      .orderBy('p.email', 'ASC')
      .limit(20)
      .getMany();
    const list = parents.map((p: any) => ({
      id: p.id,
      email: p.email || '',
      firstName: p.firstName || '',
      lastName: p.lastName || ''
    }));
    return res.json({ parents: list });
  } catch (error: any) {
    console.error('Error searching parent emails:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

function serializeParentStudentLinkForList(link: ParentStudent) {
  const student = link.student;
  const cls = student?.classEntity;
  const classDto = cls
    ? { id: cls.id, name: cls.name, form: (cls as any).form ?? null }
    : null;
  return {
    id: link.id,
    parentId: link.parentId,
    studentId: link.studentId,
    relationshipType: link.relationshipType,
    student: student
      ? {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentNumber: student.studentNumber,
          classEntity: classDto,
          class: classDto,
        }
      : null,
  };
}

function serializeParentForAdminList(parent: Parent) {
  return {
    id: parent.id,
    firstName: parent.firstName,
    lastName: parent.lastName,
    email: parent.email,
    phoneNumber: parent.phoneNumber,
    address: parent.address,
    gender: parent.gender || null,
    userId: parent.userId || null,
    parentStudents: (parent.parentStudents || []).map(serializeParentStudentLinkForList),
  };
}

export const adminListParents = async (req: AuthRequest, res: Response) => {
  try {
    const parentRepository = AppDataSource.getRepository(Parent);
    const parents = await parentRepository.find({
      relations: ['parentStudents', 'parentStudents.student', 'parentStudents.student.classEntity']
    });

    // Count students who have a user account and have logged in (at least one session log as student)
    let studentsWithAccountLoggedInCount = 0;
    try {
      const sessionRepo = AppDataSource.getRepository(UserSessionLog);
      const result = await sessionRepo
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.userId)', 'count')
        .where('LOWER(s.role) = :role', { role: 'student' })
        .getRawOne<{ count: string }>();
      studentsWithAccountLoggedInCount = result?.count != null ? parseInt(String(result.count), 10) : 0;
    } catch (e) {
      console.warn('Could not compute studentsWithAccountLoggedInCount:', e);
    }

    res.json({
      parents: parents.map(serializeParentForAdminList),
      studentsWithAccountLoggedInCount,
    });
  } catch (error: any) {
    console.error('Error listing parents:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminLinkStudentToParent = async (req: AuthRequest, res: Response) => {
  try {
    const { parentId, studentId, relationshipType } = req.body;

    if (!parentId || !studentId) {
      return res.status(400).json({ message: 'Parent ID and Student ID are required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);

    const parent = await parentRepository.findOne({ where: { id: parentId } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let link = await parentStudentRepository.findOne({
      where: { parentId: parent.id, studentId: student.id }
    });

    if (link) {
      link.relationshipType = relationshipType || link.relationshipType || 'guardian';
    } else {
      link = parentStudentRepository.create({
        parentId: parent.id,
        studentId: student.id,
        relationshipType: relationshipType || 'guardian'
      });
    }

    await parentStudentRepository.save(link);

    if (!student.parentId) {
      student.parentId = parent.id;
      await studentRepository.save(student);
    }

    res.json({
      message: 'Student linked to parent successfully',
      link
    });
  } catch (error: any) {
    console.error('Error linking student to parent (admin):', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adminUnlinkStudentFromParent = async (req: AuthRequest, res: Response) => {
  try {
    const { linkId } = req.params;

    if (!linkId) {
      return res.status(400).json({ message: 'Link ID is required' });
    }

    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const studentRepository = AppDataSource.getRepository(Student);

    const link = await parentStudentRepository.findOne({
      where: { id: linkId },
      relations: ['student']
    });

    if (!link) {
      return res.status(404).json({ message: 'Parent-student link not found' });
    }

    const student = link.student;
    const parentId = link.parentId;

    await parentStudentRepository.remove(link);

    if (student && student.parentId === parentId) {
      const remainingLinks = await parentStudentRepository.find({
        where: { studentId: student.id }
      });

      if (remainingLinks.length === 0) {
        student.parentId = null;
      } else {
        student.parentId = remainingLinks[0].parentId;
      }

      await studentRepository.save(student);
    }

    res.json({ message: 'Parent-student link removed successfully' });
  } catch (error: any) {
    console.error('Error unlinking student from parent (admin):', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

