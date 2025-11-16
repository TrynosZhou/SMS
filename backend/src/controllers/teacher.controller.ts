import { Response } from 'express';
import { In } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';
import { generateEmployeeNumber } from '../utils/employeeNumberGenerator';
import { isDemoUser } from '../utils/demoDataFilter';

export const registerTeacher = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    // Generate unique employee number with prefix JPST
    const employeeNumber = await generateEmployeeNumber();

    // Parse dateOfBirth if it's a string
    let parsedDateOfBirth: Date | null = null;
    if (dateOfBirth) {
      if (typeof dateOfBirth === 'string') {
        parsedDateOfBirth = new Date(dateOfBirth);
        if (isNaN(parsedDateOfBirth.getTime())) {
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else {
        parsedDateOfBirth = dateOfBirth;
      }
    }

    const teacherData: Partial<Teacher> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      employeeNumber,
      phoneNumber: phoneNumber?.trim() || null,
      address: address?.trim() || null
    };

    // Only include dateOfBirth if it's provided
    if (parsedDateOfBirth) {
      teacherData.dateOfBirth = parsedDateOfBirth;
    }

    const teacher = teacherRepository.create(teacherData) as Teacher;

    if (subjectIds) {
      const { Subject } = await import('../entities/Subject');
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      teacher.subjects = subjects;
    }

    if (classIds) {
      const { Class } = await import('../entities/Class');
      const classRepository = AppDataSource.getRepository(Class);
      const classes = await classRepository.find({ where: { id: In(classIds) } });
      teacher.classes = classes;
    }

    await teacherRepository.save(teacher);
    
    // Create temporary user account for teacher
    const tempUsername = `teacher_${employeeNumber}`;
    const tempPassword = `temp_${employeeNumber}_${Date.now()}`;
    const tempEmail = `${tempUsername}@school.local`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const user = userRepository.create({
      email: tempEmail,
      username: tempUsername,
      password: hashedPassword,
      role: UserRole.TEACHER,
      mustChangePassword: true,
      isTemporaryAccount: true
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);
    
    // Load the teacher with relations
    const savedTeacher = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['subjects', 'classes']
    });

    res.status(201).json({ 
      message: 'Teacher registered successfully with temporary account', 
      teacher: savedTeacher,
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        email: tempEmail,
        note: 'Teacher must change password on first login'
      }
    });
  } catch (error: any) {
    console.error('Error registering teacher:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Employee number already exists' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTeachers = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    
    // Filter by demo status if user is demo using query builder
    const queryBuilder = teacherRepository
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.subjects', 'subjects')
      .leftJoinAndSelect('teacher.classes', 'classes')
      .leftJoinAndSelect('teacher.user', 'user');
    
    if (isDemoUser(req)) {
      queryBuilder.where('user.isDemo = :isDemo', { isDemo: true });
    }
    
    const teachers = await queryBuilder.getMany();

    res.json(teachers);
  } catch (error: any) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getTeacherById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json(teacher);
  } catch (error: any) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const updateTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { firstName, lastName, phoneNumber, address, dateOfBirth, subjectIds, classIds } = req.body;
    
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (firstName) teacher.firstName = firstName.trim();
    if (lastName) teacher.lastName = lastName.trim();
    if (phoneNumber !== undefined) teacher.phoneNumber = phoneNumber?.trim() || null;
    if (address !== undefined) teacher.address = address?.trim() || null;
    if (dateOfBirth) {
      const parsedDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
      if (!isNaN(parsedDate.getTime())) {
        teacher.dateOfBirth = parsedDate;
      }
    }

    if (subjectIds) {
      const { Subject } = await import('../entities/Subject');
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      teacher.subjects = subjects;
    }

    if (classIds) {
      const { Class } = await import('../entities/Class');
      const classRepository = AppDataSource.getRepository(Class);
      const classes = await classRepository.find({ where: { id: In(classIds) } });
      teacher.classes = classes;
    }

    await teacherRepository.save(teacher);

    const updatedTeacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes']
    });

    res.json({ message: 'Teacher updated successfully', teacher: updatedTeacher });
  } catch (error: any) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete teacher with ID:', id);

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['user', 'subjects', 'classes']
    });

    if (!teacher) {
      console.log('Teacher not found with ID:', id);
      return res.status(404).json({ message: 'Teacher not found' });
    }

    console.log('Found teacher:', teacher.firstName, teacher.lastName, `(${teacher.employeeNumber})`);

    // Check if teacher has associated classes or subjects
    const classCount = teacher.classes?.length || 0;
    const subjectCount = teacher.subjects?.length || 0;

    if (classCount > 0 || subjectCount > 0) {
      // Remove associations instead of preventing deletion
      teacher.classes = [];
      teacher.subjects = [];
      await teacherRepository.save(teacher);
    }

    // Delete associated user account if it exists
    if (teacher.userId) {
      const user = await userRepository.findOne({ where: { id: teacher.userId } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

    // Delete the teacher
    console.log('Deleting teacher:', teacher.firstName, teacher.lastName);
    await teacherRepository.remove(teacher);
    console.log('Teacher deleted successfully');

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting teacher:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherId = req.user?.teacher?.id || req.params.id;

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['classes']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({ classes: teacher.classes || [] });
  } catch (error: any) {
    console.error('Error fetching teacher classes:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Create account for existing teacher
export const createTeacherAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({ where: { id } });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teacher already has an account
    if (teacher.userId) {
      const existingUser = await userRepository.findOne({ where: { id: teacher.userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Teacher already has an account' });
      }
    }

    // Create temporary user account
    const tempUsername = `teacher_${teacher.employeeNumber}`;
    const tempPassword = `temp_${teacher.employeeNumber}_${Date.now()}`;
    const tempEmail = `${tempUsername}@school.local`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const user = userRepository.create({
      email: tempEmail,
      username: tempUsername,
      password: hashedPassword,
      role: UserRole.TEACHER,
      mustChangePassword: true,
      isTemporaryAccount: true
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);

    res.json({ 
      message: 'Account created successfully',
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        email: tempEmail,
        note: 'Teacher must change password on first login'
      }
    });
  } catch (error: any) {
    console.error('Error creating teacher account:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};
