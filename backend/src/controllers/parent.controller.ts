import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { Parent } from '../entities/Parent';
import { Student } from '../entities/Student';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { parseAmount } from '../utils/numberUtils';
import { ParentStudent } from '../entities/ParentStudent';
import { validatePhoneNumber } from '../utils/phoneValidator';

// Get parent's linked students
export const getParentStudents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    let parent = req.user?.parent || null;
    if (!parent) {
      parent = await parentRepository.findOne({
        where: { userId }
      });
    }

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const links = await parentStudentRepository.find({
      where: { parentId: parent.id },
      relations: ['student', 'student.classEntity']
    });

    // Get invoice balances for each student
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentsWithBalances = await Promise.all(
      (links || []).map(async (link) => {
        const student = link.student;
        // Get the latest invoice for the student
        const latestInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id },
          order: { createdAt: 'DESC' }
        });

        // Calculate term balance and current invoice balance
        let termBalance = 0;
        let currentBalance = 0;
        
        if (latestInvoice) {
          termBalance = parseFloat(String(latestInvoice.balance || 0));
          
          // Get settings to determine next term fees
          const settingsRepository = AppDataSource.getRepository(Settings);
          const settings = await settingsRepository.findOne({
            where: {},
            order: { createdAt: 'DESC' }
          });

          // Get next term fees based on student type
          const feesSettings = settings?.feesSettings || {};
          const dayScholarTuitionFee = parseAmount(feesSettings.dayScholarTuitionFee);
          const boarderTuitionFee = parseAmount(feesSettings.boarderTuitionFee);
          const transportCost = parseAmount(feesSettings.transportCost);
          const diningHallCost = parseAmount(feesSettings.diningHallCost);
          
          // Calculate fees based on staff child status
          let nextTermFees = 0;
          
          // Staff children don't pay tuition fees
          if (!student.isStaffChild) {
            nextTermFees = student.studentType === 'Boarder'
              ? boarderTuitionFee
              : dayScholarTuitionFee;
          }
          
          // Transport cost: only for day scholars who use transport AND are not staff children
          if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
            nextTermFees += transportCost;
          }
          
          // Dining hall cost: full price for regular students, 50% for staff children
          if (student.usesDiningHall) {
            if (student.isStaffChild) {
              nextTermFees += diningHallCost * 0.5; // 50% for staff children
            } else {
              nextTermFees += diningHallCost; // Full price for regular students
            }
          }

          // Current invoice balance calculation:
          // - If term balance is zero: only fees for next term
          // - If term balance > 0: term balance + fees for next term
          if (termBalance === 0) {
            currentBalance = nextTermFees;
          } else {
            currentBalance = termBalance + nextTermFees;
          }
        }

        return {
          ...student,
          termBalance: termBalance,
          currentInvoiceBalance: currentBalance,
          relationshipType: link.relationshipType,
          parentStudentLinkId: link.id
        };
      })
    );

    res.json({ students: studentsWithBalances });
  } catch (error: any) {
    console.error('Error getting parent students:', error);
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

// Link a student to parent by Student ID (studentNumber) and DOB
export const linkStudentByIdAndDob = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId, dateOfBirth } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!studentId || !dateOfBirth) {
      return res.status(400).json({ message: 'Student ID and Date of Birth are required' });
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

    // Verify Date of Birth
    const studentDob = new Date(student.dateOfBirth);
    const providedDob = new Date(dateOfBirth);
    
    // Compare dates (ignoring time)
    const studentDobDate = new Date(studentDob.getFullYear(), studentDob.getMonth(), studentDob.getDate());
    const providedDobDate = new Date(providedDob.getFullYear(), providedDob.getMonth(), providedDob.getDate());

    if (studentDobDate.getTime() !== providedDobDate.getTime()) {
      return res.status(400).json({ message: 'Date of Birth does not match. Please verify the information.' });
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

    const studentRepository = AppDataSource.getRepository(Student);
    
    // Search by student number or name
    const students = await studentRepository
      .createQueryBuilder('student')
          .leftJoinAndSelect('student.classEntity', 'classEntity')
      .where(
        '(student.studentNumber LIKE :query OR student.firstName LIKE :query OR student.lastName LIKE :query OR CONCAT(student.firstName, \' \', student.lastName) LIKE :query)',
        { query: `%${query}%` }
      )
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
    const { firstName, lastName, phoneNumber, address, email } = req.body;

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

export const adminListParents = async (req: AuthRequest, res: Response) => {
  try {
    const parentRepository = AppDataSource.getRepository(Parent);
    const parents = await parentRepository.find({
      relations: ['parentStudents', 'parentStudents.student', 'parentStudents.student.classEntity']
    });

    res.json({ parents });
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

