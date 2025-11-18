import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { User, UserRole } from '../entities/User';
import { Class } from '../entities/Class';
import { Marks } from '../entities/Marks';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Parent } from '../entities/Parent';
import { AuthRequest } from '../middleware/auth';
import { generateStudentId } from '../utils/studentIdGenerator';
import { Settings } from '../entities/Settings';
import QRCode from 'qrcode';
import { createStudentIdCardPDF } from '../utils/studentIdCardPdf';
import { isDemoUser } from '../utils/demoDataFilter';

export const registerStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const parseBoolean = (value: any): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) {
          return true;
        }
        if (['false', '0', 'no', 'n', ''].includes(normalized)) {
          return false;
        }
      }
      return Boolean(value);
    };

    const { firstName, lastName, dateOfBirth, gender, address, phoneNumber, contactNumber, studentType, usesTransport, usesDiningHall, isStaffChild, classId, parentId } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required' });
    }

    if (!gender) {
      return res.status(400).json({ message: 'Gender is required' });
    }

    if (!contactNumber && !phoneNumber) {
      return res.status(400).json({ message: 'Contact number is required' });
    }

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required for student enrollment' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    // Verify class exists
    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (parentId) {
      const parent = await AppDataSource.getRepository(Parent).findOne({ where: { id: parentId } });
      if (!parent) {
        return res.status(404).json({ message: 'Parent not found' });
      }
    }

    // Generate unique student ID with prefix from settings
    const studentNumber = await generateStudentId();

    // Parse dateOfBirth if it's a string
    let parsedDateOfBirth: Date;
    if (typeof dateOfBirth === 'string') {
      parsedDateOfBirth = new Date(dateOfBirth);
      if (isNaN(parsedDateOfBirth.getTime())) {
        return res.status(400).json({ message: 'Invalid date of birth format' });
      }
    } else {
      parsedDateOfBirth = dateOfBirth;
    }

    // Use contactNumber if provided, otherwise fall back to phoneNumber
    const finalContactNumber = contactNumber?.trim() || phoneNumber?.trim() || null;
    
    // Validate studentType
    const normalizedStudentType = typeof studentType === 'string' ? studentType.trim().toLowerCase() : '';
    const validStudentType = normalizedStudentType === 'boarder' ? 'Boarder' : 'Day Scholar';

    // Handle photo upload
    let photoPath: string | null = null;
    if (req.file) {
      photoPath = `/uploads/students/${req.file.filename}`;
    }

    const usesTransportFlag = parseBoolean(usesTransport);
    const usesDiningHallFlag = parseBoolean(usesDiningHall);
    const isStaffChildFlag = parseBoolean(isStaffChild);

    // Create student with auto-generated ID and auto-enrollment
    const student = studentRepository.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      studentNumber,
      dateOfBirth: parsedDateOfBirth,
      gender,
      address: address?.trim() || null,
      phoneNumber: finalContactNumber,
      contactNumber: finalContactNumber,
      studentType: validStudentType,
      usesTransport: usesTransportFlag,
      usesDiningHall: usesDiningHallFlag,
      isStaffChild: isStaffChildFlag,
      photo: photoPath,
      classId, // Auto-enroll into the specified class
      parentId: parentId || null,
      enrollmentDate: new Date()
    });

    await studentRepository.save(student);

    // Load the student with class relation
    const savedStudent = await studentRepository.findOne({
      where: { id: student.id },
      relations: ['class', 'parent']
    });

    // Automatically create an initial invoice for the new student
    try {
      console.log('📋 Creating invoice for new student:', savedStudent?.studentNumber || student.studentNumber);
      console.log('📋 Student ID:', savedStudent?.id || student.id);
      const settings = await settingsRepository.findOne({
        order: { createdAt: 'DESC' }
      });

      if (!settings) {
        console.warn('⚠️ No settings found');
        console.warn('⚠️ Invoice not created - please configure fees in Settings page');
      } else if (!settings.feesSettings) {
        console.warn('⚠️ No feesSettings found in settings');
        console.warn('⚠️ Invoice not created - please configure fees in Settings page');
      } else {
        const fees = settings.feesSettings;
        const dayScholarTuition = parseFloat(String(fees.dayScholarTuitionFee || 0));
        const boarderTuition = parseFloat(String(fees.boarderTuitionFee || 0));
        const registrationFee = parseFloat(String(fees.registrationFee || 0));
        const deskFee = parseFloat(String(fees.deskFee || 0));
        const transportCost = parseFloat(String(fees.transportCost || 0));
        const diningHallCost = parseFloat(String(fees.diningHallCost || 0));
        
        console.log('💰 Fee settings loaded:', {
          dayScholarTuition,
          boarderTuition,
          registrationFee,
          deskFee,
          transportCost,
          diningHallCost,
          studentType: validStudentType,
          isStaffChild: isStaffChildFlag,
          usesTransport: usesTransportFlag,
          usesDiningHall: usesDiningHallFlag
        });

        // Calculate fees based on student type and staff child status
        let totalAmount = 0;
        const invoiceItems: string[] = [];
        
        if (!isStaffChildFlag) {
          // Non-staff children pay registration fee, desk fee, and tuition for current term
          
          // Registration fee: charged once at registration (both boarders and day scholars)
          if (registrationFee > 0) {
            totalAmount += registrationFee;
            invoiceItems.push(`Registration Fee: ${registrationFee}`);
          } else {
            console.log('ℹ️ Registration fee is 0 or not set');
          }
          
          // Desk fee: charged once at registration (both boarders and day scholars)
          if (deskFee > 0) {
            totalAmount += deskFee;
            invoiceItems.push(`Desk Fee: ${deskFee}`);
          } else {
            console.log('ℹ️ Desk fee is 0 or not set');
          }
          
          // Tuition fee for current term (based on student type)
          const tuitionFee = validStudentType === 'Boarder' ? boarderTuition : dayScholarTuition;
          if (tuitionFee > 0) {
            totalAmount += tuitionFee;
            invoiceItems.push(`Tuition Fee (${validStudentType}): ${tuitionFee}`);
          } else {
            console.warn(`⚠️ Tuition fee is 0 or not set for ${validStudentType}`);
            console.warn(`⚠️ Please set ${validStudentType === 'Boarder' ? 'boarderTuitionFee' : 'dayScholarTuitionFee'} in Settings`);
          }
          
          // Transport fee: only for day scholars who use public transport
          if (validStudentType === 'Day Scholar' && usesTransportFlag && transportCost > 0) {
            totalAmount += transportCost;
            invoiceItems.push(`Transport Fee: ${transportCost}`);
          }
          
          // Dining hall fee: day scholars who take DH meals pay full fee (no discount)
          if (validStudentType === 'Day Scholar' && usesDiningHallFlag && diningHallCost > 0) {
            totalAmount += diningHallCost;
            invoiceItems.push(`Dining Hall Fee: ${diningHallCost}`);
          }
        } else {
          // Staff children: pay nothing unless they take DH meals (then pay 50% of DH fee)
          if (usesDiningHallFlag && diningHallCost > 0) {
            const staffChildDHFee = diningHallCost * 0.5;
            totalAmount += staffChildDHFee;
            invoiceItems.push(`Dining Hall Fee (Staff Child - 50%): ${staffChildDHFee}`);
          } else {
            console.log('ℹ️ Staff child - no fees applicable (no DH meals)');
          }
        }

        totalAmount = parseFloat(totalAmount.toFixed(2));
        console.log('💰 Calculated total amount:', totalAmount);
        console.log('📝 Invoice items:', invoiceItems);

        if (totalAmount > 0) {
          const invoiceCount = await invoiceRepository.count();
          const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          const term = settings.currentTerm || settings.activeTerm || `Term 1 ${new Date().getFullYear()}`;

          // Build description from invoice items
          const description = invoiceItems.length > 0 
            ? `Initial fees upon registration: ${invoiceItems.join(', ')}`
            : isStaffChildFlag && !usesDiningHallFlag
              ? 'Staff child - no fees applicable'
              : 'Initial fees upon registration';
          
          // Ensure balance is a proper decimal number
          const balanceValue = parseFloat(totalAmount.toFixed(2));
          const amountValue = parseFloat(totalAmount.toFixed(2));
          
          // Use savedStudent.id to ensure we have the correct student ID
          const studentIdForInvoice = savedStudent?.id || student.id;
          console.log('📋 Using student ID for invoice:', studentIdForInvoice);
          
          const initialInvoice = invoiceRepository.create({
            invoiceNumber,
            studentId: studentIdForInvoice,
            amount: amountValue,
            previousBalance: 0,
            paidAmount: 0,
            balance: balanceValue,
            prepaidAmount: 0,
            uniformTotal: 0,
            dueDate,
            term,
            description,
            status: InvoiceStatus.PENDING,
            uniformItems: []
          });
          
          console.log('📋 Invoice object before save:', {
            invoiceNumber,
            studentId: studentIdForInvoice,
            amount: amountValue,
            balance: balanceValue
          });

          const savedInvoice = await invoiceRepository.save(initialInvoice);
          console.log('✅ Invoice created successfully:', invoiceNumber, 'Amount:', amountValue, 'Balance:', balanceValue);
          console.log('✅ Saved invoice balance:', savedInvoice.balance, 'Type:', typeof savedInvoice.balance);
          
          // Verify the invoice was saved correctly
          const verifyInvoice = await invoiceRepository.findOne({ 
            where: { id: savedInvoice.id } 
          });
          if (verifyInvoice) {
            console.log('✅ Verified invoice balance from DB:', verifyInvoice.balance);
          } else {
            console.error('❌ Could not verify invoice after save');
          }
        } else {
          console.warn('⚠️ No invoice created - total amount is 0');
          console.warn('⚠️ Please configure fees in Settings page:');
          console.warn('   - Registration Fee');
          console.warn('   - Desk Fee');
          console.warn(`   - ${validStudentType === 'Boarder' ? 'Boarder' : 'Day Scholar'} Tuition Fee`);
        }
      }
    } catch (invoiceError) {
      console.error('❌ Error creating initial invoice for new student:', invoiceError);
      console.error('❌ Error details:', invoiceError);
      // Continue without failing the student registration
    }

    res.status(201).json({ 
      message: 'Student registered and enrolled successfully', 
      student: savedStudent 
    });
  } catch (error: any) {
    console.error('Error registering student:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Student number already exists' });
    }
    
    if (error.code === '23503') {
      return res.status(400).json({ message: 'Invalid class or parent reference' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const { classId } = req.query;

    console.log('Fetching students with classId:', classId);

    let students: Student[] = [];

    if (classId) {
      // Ensure classId is trimmed and valid
      const trimmedClassId = String(classId).trim();
      console.log('Filtering students by classId:', trimmedClassId);

      // First, try query builder to properly filter by demo status
      const queryBuilder = studentRepository
        .createQueryBuilder('student')
        .leftJoinAndSelect('student.classEntity', 'classEntity')
        .leftJoinAndSelect('student.parent', 'parent')
        .leftJoinAndSelect('student.user', 'user')
        .where('student.classId = :classId', { classId: trimmedClassId });
      
      // Filter by demo status if user is demo
      if (isDemoUser(req)) {
        queryBuilder.andWhere('user.isDemo = :isDemo', { isDemo: true });
      }
      
      students = await queryBuilder.getMany();
      console.log(`Found ${students.length} students using query builder for classId: ${trimmedClassId}`);
      
      if (isDemoUser(req)) {
        console.log('Demo user - filtered to show only demo students');
      }

      // If still no students found, try a more permissive approach
      if (students.length === 0) {
        console.log('No students found with query builder, trying alternative methods...');
        
        // Try finding by class name if we can get the class
        const classRepository = AppDataSource.getRepository(Class);
        const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
        
        if (classEntity) {
          console.log(`Found class: ${classEntity.name} (${classEntity.id})`);
          
          // Try query by class name as fallback
          const studentsByClassName = await studentRepository
            .createQueryBuilder('student')
            .leftJoinAndSelect('student.classEntity', 'classEntity')
            .leftJoinAndSelect('student.parent', 'parent')
            .leftJoinAndSelect('student.user', 'user')
            .where('class.name = :className', { className: classEntity.name })
            .getMany();
          
          console.log(`Found ${studentsByClassName.length} students by class name: ${classEntity.name}`);
          
          if (studentsByClassName.length > 0) {
            students = studentsByClassName;
            // Update their classId to match
            console.log('Updating students classId to match...');
            for (const student of students) {
              if (student.classId !== trimmedClassId) {
                student.classId = trimmedClassId;
                await studentRepository.save(student);
                console.log(`Updated student ${student.firstName} ${student.lastName} classId to ${trimmedClassId}`);
              }
            }
          }
        }
      }

      // Final fallback: get all students and filter in memory
      if (students.length === 0) {
        console.log('Trying final fallback: loading all students...');
        const allStudents = await studentRepository.find({
          relations: ['class', 'parent', 'user']
        });
        
        // Filter by classId or class.id
        students = allStudents.filter(s => 
          (s.classId && s.classId === trimmedClassId) || 
          (s.classEntity && s.classEntity.id === trimmedClassId)
        );
        
        console.log(`Found ${students.length} students after filtering all students`);
        
        // Log all students for debugging
        console.log(`Total students in database: ${allStudents.length}`);
        allStudents.forEach((s, idx) => {
          console.log(`Student ${idx + 1}: ${s.firstName} ${s.lastName}, classId: ${s.classId}, classEntity.name: ${s.classEntity?.name || 'N/A'}, classEntity.id: ${s.classEntity?.id || 'N/A'}`);
        });
      }

      if (students.length > 0) {
        console.log('Sample student classId:', students[0].classId);
        console.log('Sample student classEntity:', students[0].classEntity?.name);
        console.log('Sample student classEntity.id:', students[0].classEntity?.id);
      }
    } else {
      // No classId provided, return all students
      // Filter by demo status if user is demo
      const queryBuilder = studentRepository
        .createQueryBuilder('student')
        .leftJoinAndSelect('student.classEntity', 'classEntity')
        .leftJoinAndSelect('student.parent', 'parent')
        .leftJoinAndSelect('student.user', 'user');
      
      if (isDemoUser(req)) {
        queryBuilder.andWhere('user.isDemo = :isDemo', { isDemo: true });
      }
      
      students = await queryBuilder.getMany();
      console.log(`No classId provided, returning all ${students.length} students`);
    }

    // Filter to only return active students (if isActive is false, exclude them)
    const activeStudents = students.filter(s => s.isActive !== false);
    console.log(`Returning ${activeStudents.length} active students`);

    res.json(activeStudents);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getStudentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const studentRepository = AppDataSource.getRepository(Student);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['class', 'parent', 'user', 'marks', 'invoices']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const enrollStudent = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, classId } = req.body;
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    const student = await studentRepository.findOne({ where: { id: studentId } });
    const classEntity = await classRepository.findOne({ where: { id: classId } });

    if (!student || !classEntity) {
      return res.status(404).json({ message: 'Student or class not found' });
    }

    student.classId = classId;
    await studentRepository.save(student);

    res.json({ message: 'Student enrolled successfully', student });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      address,
      phoneNumber,
      contactNumber,
      studentType,
      usesTransport,
      usesDiningHall,
      isStaffChild,
      classId,
      parentId,
      photo
    } = req.body;

    console.log('Updating student with ID:', id);
    console.log('Received update data:', req.body);

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const parentRepository = AppDataSource.getRepository(Parent);

    const student = await studentRepository.findOne({ 
      where: { id },
      relations: ['class']
    });

    if (!student) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Found student:', student.firstName, student.lastName);

    // Update firstName
    if (firstName !== undefined && firstName !== null) {
      student.firstName = String(firstName).trim();
    }

    // Update lastName
    if (lastName !== undefined && lastName !== null) {
      student.lastName = String(lastName).trim();
    }

    // Update dateOfBirth
    if (dateOfBirth !== undefined && dateOfBirth !== null) {
      let parsedDate: Date;
      if (typeof dateOfBirth === 'string') {
        // Handle HTML date input format (YYYY-MM-DD)
        if (dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = dateOfBirth.split('-').map(Number);
          parsedDate = new Date(year, month - 1, day);
        } else {
          parsedDate = new Date(dateOfBirth);
        }
        
        if (!isNaN(parsedDate.getTime())) {
          student.dateOfBirth = parsedDate;
        } else {
          console.error('Invalid date format:', dateOfBirth);
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else if (dateOfBirth instanceof Date) {
        student.dateOfBirth = dateOfBirth;
      }
    }

    // Update gender
    if (gender !== undefined && gender !== null) {
      student.gender = String(gender).trim();
    }

    // Update address
    if (address !== undefined) {
      student.address = address ? String(address).trim() : null;
    }

    // Handle contact number - use contactNumber if provided, otherwise phoneNumber
    if (contactNumber !== undefined || phoneNumber !== undefined) {
      const finalContactNumber = contactNumber?.trim() || phoneNumber?.trim() || null;
      student.contactNumber = finalContactNumber;
      student.phoneNumber = finalContactNumber;
    }

    // Handle student type validation
    if (studentType !== undefined && studentType !== null) {
      const normalizedStudentType = typeof studentType === 'string' ? studentType.trim().toLowerCase() : '';
      const validStudentType = normalizedStudentType === 'boarder' ? 'Boarder' : 'Day Scholar';
      student.studentType = validStudentType;
    }

    // Update transport usage (only for day scholars)
    if (usesTransport !== undefined) {
      student.usesTransport = Boolean(usesTransport);
    }

    // Update dining hall usage (only for day scholars)
    if (usesDiningHall !== undefined) {
      student.usesDiningHall = Boolean(usesDiningHall);
    }

    // Update staff child status
    if (isStaffChild !== undefined) {
      student.isStaffChild = Boolean(isStaffChild);
    }

    // Handle photo upload or update
    if (req.file) {
      // New photo uploaded - delete old photo if exists
      if (student.photo) {
        const fs = require('fs');
        const path = require('path');
        const oldPhotoPath = path.join(__dirname, '../../', student.photo.replace(/^\//, ''));
        try {
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
          }
        } catch (err) {
          console.error('Error deleting old photo:', err);
        }
      }
      // Set new photo path
      student.photo = `/uploads/students/${req.file.filename}`;
    } else if (photo !== undefined) {
      // Photo path provided (preserve existing or set to null)
      student.photo = photo || null;
    }

    // Update classId if provided (always update if classId is in the request, even if it's the same)
    if (classId !== undefined) {
      if (classId === null || classId === '') {
        // Allow setting classId to null/empty if explicitly provided
        student.classId = null;
        // Don't set student.classEntity = null as it's not nullable in TypeScript
        // TypeORM will handle the relation based on classId
        console.log('Removing student from class');
      } else {
        // Verify class exists
        const trimmedClassId = String(classId).trim();
        const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
        if (!classEntity) {
          console.error('Class not found with ID:', trimmedClassId);
          return res.status(404).json({ message: 'Class not found' });
        }
        const oldClassId = student.classId;
        const oldClassName = student.classEntity?.name || 'N/A';
        
        // Update both classId and the classEntity relation to ensure consistency
        student.classId = trimmedClassId;
        student.classEntity = classEntity; // Explicitly set the relation
        
        console.log('Updating student class from', oldClassName, '(ID: ' + oldClassId + ') to:', classEntity.name, '(ID: ' + trimmedClassId + ')');
        console.log('Setting student.classEntity relation to:', classEntity.name);
      }
    }

    // Update parentId if provided
    if (parentId !== undefined) {
      if (parentId) {
        const parent = await parentRepository.findOne({ where: { id: parentId } });
        if (!parent) {
          return res.status(404).json({ message: 'Parent not found' });
        }
      }
      student.parentId = parentId || null;
    }

    console.log('Saving updated student...');
    console.log('Student classId before save:', student.classId);
    console.log('Student classEntity relation before save:', student.classEntity?.name || 'null');
    
    // Save the student - this should update both classId and the relation
    const savedStudent = await studentRepository.save(student);
    console.log('Student classId after save:', savedStudent.classId);
    console.log('Student classEntity relation after save:', savedStudent.classEntity?.name || 'null');

    // Use update query to ensure classId is definitely updated in the database
    if (classId !== undefined && classId !== null && classId !== '') {
      const trimmedClassId = String(classId).trim();
       await studentRepository.update({ id }, { classId: trimmedClassId });
      console.log('Explicitly updated classId via update query:', trimmedClassId);
    }

    // Reload student with relations to get fresh data from database
    const updatedStudent = await studentRepository.findOne({
      where: { id },
      relations: ['class', 'parent']
    });

    if (!updatedStudent) {
      console.error('Failed to reload student after update');
      return res.status(500).json({ message: 'Failed to reload student after update' });
    }

    console.log('Student updated successfully');
    console.log('Updated student classId:', updatedStudent.classId);
    console.log('Updated student classEntity name:', updatedStudent.classEntity?.name || 'N/A');
    console.log('Updated student classEntity id:', updatedStudent.classEntity?.id || 'N/A');
    
    res.json({ message: 'Student updated successfully', student: updatedStudent });
  } catch (error: any) {
    console.error('Error updating student:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const promoteStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { fromClassId, toClassId } = req.body;

    if (!fromClassId || !toClassId) {
      return res.status(400).json({ message: 'From class ID and to class ID are required' });
    }

    if (fromClassId === toClassId) {
      return res.status(400).json({ message: 'Cannot promote students to the same class' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    // Verify both classes exist
    const fromClass = await classRepository.findOne({ where: { id: fromClassId } });
    const toClass = await classRepository.findOne({ where: { id: toClassId } });

    if (!fromClass) {
      return res.status(404).json({ message: 'Source class not found' });
    }

    if (!toClass) {
      return res.status(404).json({ message: 'Destination class not found' });
    }

    // Get all students in the source class
    const students = await studentRepository.find({
      where: { classId: fromClassId },
      relations: ['class']
    });

    if (students.length === 0) {
      return res.status(400).json({ message: 'No students found in the source class' });
    }

    // Update all students to the new class
    let promotedCount = 0;
    for (const student of students) {
      student.classId = toClassId;
       await studentRepository.save(student);
      promotedCount++;
    }

    res.json({
      message: `Successfully promoted ${promotedCount} student(s) from ${fromClass.name} to ${toClass.name}`,
      promotedCount,
      fromClass: fromClass.name,
      toClass: toClass.name
    });
  } catch (error: any) {
    console.error('Error promoting students:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete student with ID:', id);

    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const userRepository = AppDataSource.getRepository(User);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['marks', 'invoices', 'user', 'class', 'parent']
    });

    if (!student) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Found student:', student.firstName, student.lastName, `(${student.studentNumber})`);

    // Delete all report card remarks associated with this student
    const remarks = await remarksRepository.find({
      where: { studentId: id }
    });
    
    if (remarks.length > 0) {
      console.log(`Deleting ${remarks.length} report card remarks associated with student`);
      await remarksRepository.remove(remarks);
    }

    // Delete all marks associated with this student
    const marks = await marksRepository.find({
      where: { studentId: id }
    });
    
    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with student`);
      await marksRepository.remove(marks);
    }

    // Delete all invoices associated with this student
    const invoices = await invoiceRepository.find({
      where: { studentId: id }
    });
    
    if (invoices.length > 0) {
      console.log(`Deleting ${invoices.length} invoices associated with student`);
      await invoiceRepository.remove(invoices);
    }

    // Delete associated user account if it exists
    if (student.userId) {
      const user = await userRepository.findOne({ where: { id: student.userId } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

    // Delete the student
    console.log('Deleting student:', student.firstName, student.lastName);
    await studentRepository.remove(student);
    console.log('Student deleted successfully');

    res.json({ message: 'Student deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const generateStudentIdCard = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const parentRepository = AppDataSource.getRepository(Parent);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['class', 'parent']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check permissions: SUPERADMIN, ADMIN, ACCOUNTANT, and TEACHER can view any student's ID card
    // PARENT can only view their own linked students' ID cards
    const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
    if (!allowedRoles.includes(user.role)) {
      if (user.role === UserRole.PARENT) {
        // Check if the student is linked to this parent
        const parent = await parentRepository.findOne({
          where: { userId: user.id }
        });

        if (!parent || student.parentId !== parent.id) {
          console.log(`Parent ${user.id} attempted to access student ${id} ID card but student is not linked`);
          return res.status(403).json({ message: 'You do not have permission to view this student\'s ID card' });
        }
      } else {
        console.log(`User ${user.id} with role ${user.role} attempted to access student ID card but lacks permission. Allowed roles: ${allowedRoles.join(', ')}`);
        return res.status(403).json({ 
          message: 'Insufficient permissions to view student ID cards. Required role: Admin, Super Admin, Accountant, or Teacher.',
          userRole: user.role,
          allowedRoles: allowedRoles
        });
      }
    }

    const settings = await settingsRepository.findOne({
      order: { createdAt: 'DESC' }
    });

    const qrPayload = {
      studentId: student.id,
      studentNumber: student.studentNumber,
      name: `${student.firstName} ${student.lastName}`.trim(),
      class: student.classEntity?.name || null,
      studentType: student.studentType,
      issuedAt: new Date().toISOString()
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));

    const pdfBuffer = await createStudentIdCardPDF({
      student,
      settings: settings || null,
      qrDataUrl,
      photoPath: student.photo
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${student.studentNumber || 'student'}-id-card.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating student ID card:', error);
    return res.status(500).json({ message: 'Failed to generate student ID card' });
  }
};

