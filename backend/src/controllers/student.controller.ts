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
import { ParentStudent } from '../entities/ParentStudent';
import { generateStudentId } from '../utils/studentIdGenerator';
import { Settings } from '../entities/Settings';
import QRCode from 'qrcode';
import {
  createLogisticsReportHTMLBuffer,
  extractGradeLabel,
  LogisticsReportRow,
} from '../utils/logisticsReportHtmlGenerator';
import { createStudentIdCardPDF, createStudentIdCardsPDFBatch } from '../utils/studentIdCardPdf';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount } from '../utils/numberUtils';
import { parseBoolean } from '../utils/booleanUtils';
import {
  computeLogisticsFees,
  logisticsProfileChanged,
  repairStaleLogisticsInvoiceBalances,
  recomputeInvoiceTotalsFromLineItems,
  snapshotFromStudent,
  syncStudentLogisticsInvoices
} from '../utils/studentLogisticsInvoice';
import {
  applyExemptionToInvoice,
  isBalanceOnlyExemption,
  isStaffSiblingExemption,
  syncExemptionInvoicesForStudent
} from '../utils/exemptionInvoice';
import { calculateAge } from '../utils/ageUtils';
import { StudentTransfer, StudentTransferStatus, TransferType } from '../entities/StudentTransfer';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';
import { validatePhoneNumber } from '../utils/phoneValidator';
import { PaymentLog } from '../entities/PaymentLog';
import { UserActionLog } from '../entities/UserActionLog';
import { In, EntityManager } from 'typeorm';
import { Attendance } from '../entities/Attendance';
import { RecordBook } from '../entities/RecordBook';
import { ExamStudentPassRateInclusion } from '../entities/ExamStudentPassRateInclusion';
import { InventoryFine } from '../entities/InventoryFine';
import { InventoryTextbookIssuance } from '../entities/InventoryTextbookIssuance';
import { InventoryFurnitureIssuance } from '../entities/InventoryFurnitureIssuance';
import { UniformPaymentLog } from '../entities/UniformPaymentLog';
import { UniformCharge } from '../entities/UniformCharge';
import { UniformChargeItem } from '../entities/UniformChargeItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { ElearningResponse } from '../entities/ElearningResponse';
import { ElearningTask } from '../entities/ElearningTask';

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

    const { firstName, lastName, dateOfBirth, gender, address, phoneNumber, contactNumber, studentType, studentStatus, usesTransport, usesDiningHall, isStaffChild, isExempted, classId, parentId, classLevel, grade } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    if (!gender) {
      return res.status(400).json({ message: 'Gender is required' });
    }

    // Validate contact / phone numbers if provided (optional)
    const primaryContact = (contactNumber || phoneNumber || '').trim();
    if (primaryContact) {
      const contactValidation = validatePhoneNumber(primaryContact, true);
      if (!contactValidation.isValid) {
        return res.status(400).json({ message: contactValidation.error || 'Invalid contact number' });
      }
    }

    // Validate secondary phone number if provided and different from primary
    if (phoneNumber && phoneNumber.trim() && phoneNumber !== contactNumber) {
      const phoneValidation = validatePhoneNumber(phoneNumber, false);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
      }
    }

    // Registration does not require class assignment. classId is optional and handled later by enrollment.

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    // If classId is provided during registration, verify it exists (optional early enrollment)
    let classEntity = null as Class | null;
    if (classId) {
      classEntity = await classRepository.findOne({ where: { id: classId } });
      if (!classEntity) {
        return res.status(404).json({ message: 'Class not found' });
      }
    }

    if (parentId) {
      const parent = await AppDataSource.getRepository(Parent).findOne({ where: { id: parentId } });
      if (!parent) {
        return res.status(404).json({ message: 'Parent not found' });
      }
    }

    // Generate unique student ID with prefix from settings
    const studentNumber = await generateStudentId();

    // Parse dateOfBirth if provided
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

    // If date of birth is provided, enforce age range 3–13 years
    if (parsedDateOfBirth) {
      const studentAge = calculateAge(parsedDateOfBirth);
      if (studentAge < 3 || studentAge > 13) {
        return res.status(400).json({ message: 'Student age must be between 3 and 13 years' });
      }
    }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedAddress = address && String(address).trim() ? String(address).trim() : null;
    const normalizedStudentStatusRaw = typeof studentStatus === 'string' ? studentStatus.trim().toLowerCase() : '';
    const validStudentStatus = normalizedStudentStatusRaw.includes('existing') ? 'Existing' : 'New';
    const normalizedGrade = (() => {
      const v = typeof grade === 'string' && grade.trim() ? grade.trim() : null;
      const alt = typeof classLevel === 'string' && classLevel.trim() ? classLevel.trim() : null;
      return v || alt;
    })();

    let duplicateQuery = studentRepository
      .createQueryBuilder('student')
      .where('LOWER(student.firstName) = LOWER(:firstName)', { firstName: normalizedFirstName })
      .andWhere('LOWER(student.lastName) = LOWER(:lastName)', { lastName: normalizedLastName })
      .andWhere('student.gender = :gender', { gender })
      .andWhere(
        'COALESCE(LOWER(student.address), \'\') = COALESCE(LOWER(:address), \'\')',
        { address: normalizedAddress || '' }
      );

    if (parsedDateOfBirth) {
      duplicateQuery = duplicateQuery.andWhere('student.dateOfBirth = :dob', { dob: parsedDateOfBirth });
    } else {
      duplicateQuery = duplicateQuery.andWhere('student.dateOfBirth IS NULL');
    }

    const existingStudent = await duplicateQuery.getOne();
    if (existingStudent) {
      const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();
      return res.status(400).json({ message: `The record for ${fullName} already exists.` });
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
    const isExemptedFlag = parseBoolean(isExempted);
    const registrationExemptionType = (req.body as any).exemptionType
      ? String((req.body as any).exemptionType).trim()
      : null;
    const isStaffSiblingOnly =
      isStaffChildFlag || registrationExemptionType === 'staff_sibling';

    // Create student with auto-generated ID; class assignment is optional (enrollment happens later)
    const student = studentRepository.create({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      studentNumber,
      dateOfBirth: parsedDateOfBirth,
      gender,
      studentStatus: validStudentStatus,
      address: normalizedAddress,
      phoneNumber: finalContactNumber,
      contactNumber: finalContactNumber,
      studentType: validStudentType,
      usesTransport: usesTransportFlag,
      usesDiningHall: usesDiningHallFlag,
      isStaffChild: isStaffChildFlag,
      isExempted: isExemptedFlag,
      photo: photoPath,
      classId: classEntity ? classEntity.id : null,
      classLevel: normalizedGrade || null,
      grade: normalizedGrade || null,
      parentId: parentId || null,
      enrollmentDate: new Date()
    });

    await studentRepository.save(student);

    // Load the student with class relation
    const savedStudent = await studentRepository.findOne({
      where: { id: student.id },
      relations: ['classEntity', 'parent']
    });

    // Automatically create an initial invoice for the new student
    try {
      console.log('📋 Creating invoice for new student:', savedStudent?.studentNumber || student.studentNumber);
      console.log('📋 Student ID:', savedStudent?.id || student.id);
      const settings = await settingsRepository.findOne({
        where: {},
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
        const dayScholarTuition = parseAmount(fees.dayScholarTuitionFee);
        const boarderTuition = parseAmount(fees.boarderTuitionFee);
        const registrationFee = parseAmount(fees.registrationFee);
        const deskFee = parseAmount(fees.deskFee);
        const transportCost = parseAmount(fees.transportCost);
        const diningHallCost = parseAmount(fees.diningHallCost);
        
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

        let totalAmount = 0;
        const invoiceItems: string[] = [];

        if (!isStaffSiblingOnly) {
          if (validStudentStatus === 'New') {
            if (registrationFee > 0) {
              totalAmount += registrationFee;
              invoiceItems.push(`Registration Fee: ${registrationFee}`);
            } else {
              console.log('ℹ️ Registration fee is 0 or not set');
            }
            
            if (deskFee > 0) {
              totalAmount += deskFee;
              invoiceItems.push(`Desk Fee: ${deskFee}`);
            } else {
              console.log('ℹ️ Desk fee is 0 or not set');
            }
          }

          const tuitionFee = validStudentType === 'Boarder' ? boarderTuition : dayScholarTuition;
          if (tuitionFee > 0) {
            totalAmount += tuitionFee;
            invoiceItems.push(`Tuition Fee (${validStudentType}): ${tuitionFee}`);
          } else {
            console.warn(`⚠️ Tuition fee is 0 or not set for ${validStudentType}`);
            console.warn(`⚠️ Please set ${validStudentType === 'Boarder' ? 'boarderTuitionFee' : 'dayScholarTuitionFee'} in Settings`);
          }
          
          if (validStudentType === 'Day Scholar' && usesTransportFlag && transportCost > 0) {
            totalAmount += transportCost;
            invoiceItems.push(`Transport Fee: ${transportCost}`);
          }
          
          if (validStudentType === 'Day Scholar' && usesDiningHallFlag && diningHallCost > 0) {
            totalAmount += diningHallCost;
            invoiceItems.push(`Dining Hall Fee: ${diningHallCost}`);
          }
        } else {
          if (usesDiningHallFlag && diningHallCost > 0) {
            const staffChildDHFee = diningHallCost * 0.5;
            totalAmount += staffChildDHFee;
            invoiceItems.push(`Dining Hall Fee (50%): ${staffChildDHFee}`);
          } else {
            console.log('ℹ️ Staff sibling - no fees applicable (no DH meals)');
          }
        }

        totalAmount = parseFloat(totalAmount.toFixed(2));
        console.log('💰 Calculated total amount:', totalAmount);
        console.log('📝 Invoice items:', invoiceItems);

        if (totalAmount > 0) {
          const currentYear = new Date().getFullYear();
          const invoicePrefix = `INV-${currentYear}-`;

          const lastInvoiceForYear = await invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.invoiceNumber LIKE :prefix', { prefix: `${invoicePrefix}%` })
            .orderBy('invoice.invoiceNumber', 'DESC')
            .getOne();

          let nextSequence = 1;
          if (lastInvoiceForYear?.invoiceNumber) {
            const parts = String(lastInvoiceForYear.invoiceNumber).split('-');
            const lastSeqRaw = parts[2] || '';
            const lastSeq = parseInt(lastSeqRaw, 10);
            if (!isNaN(lastSeq) && lastSeq >= 1) {
              nextSequence = lastSeq + 1;
            }
          }

          const invoiceNumber = `${invoicePrefix}${String(nextSequence).padStart(6, '0')}`;

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          const term = settings.currentTerm || settings.activeTerm || `Term 1 ${new Date().getFullYear()}`;

          // Build description from invoice items
          const description = invoiceItems.length > 0 
            ? `Initial fees upon registration: ${invoiceItems.join(', ')}`
              : 'Initial fees upon registration';
          
          // Ensure balance is a proper decimal number
          const balanceValue = parseFloat(totalAmount.toFixed(2));
          const amountValue = parseFloat(totalAmount.toFixed(2));
          
          // Use savedStudent.id to ensure we have the correct student ID
          const studentIdForInvoice = savedStudent?.id || student.id;
          console.log('📋 Using student ID for invoice:', studentIdForInvoice);
          
          // Recompute canonical fee components for storage on the invoice
          const tuitionForInvoice = (() => {
            if (isStaffSiblingOnly) {
              return 0;
            }
            const base = validStudentType === 'Boarder' ? boarderTuition : dayScholarTuition;
            return base > 0 ? parseFloat(base.toFixed(2)) : 0;
          })();

          const logisticsSnap = snapshotFromStudent({
            studentType: validStudentType,
            usesTransport: usesTransportFlag,
            usesDiningHall: usesDiningHallFlag,
            isStaffChild: isStaffSiblingOnly,
            isExempted: isExemptedFlag
          });
          const logisticsFees = computeLogisticsFees(logisticsSnap, fees);
          const transportForInvoice = logisticsFees.transport;
          const diningForInvoice = logisticsFees.diningHall;
          let registrationForInvoice = 0;
          let deskForInvoice = 0;
          if (!isStaffSiblingOnly && validStudentStatus === 'New') {
            if (registrationFee > 0) {
              registrationForInvoice = parseFloat(registrationFee.toFixed(2));
            }
            if (deskFee > 0) {
              deskForInvoice = parseFloat(deskFee.toFixed(2));
            }
          }

          const initialInvoice = invoiceRepository.create({
            invoiceNumber,
            studentId: studentIdForInvoice,
            amount: amountValue,
            previousBalance: 0,
            paidAmount: 0,
            balance: balanceValue,
            prepaidAmount: 0,
            uniformTotal: 0,
            // Canonical fee components so invoice/receipt statements can show
            // separate Tuition / Transport / Dining / Registration / Desk lines
            tuitionAmount: tuitionForInvoice,
            transportAmount: transportForInvoice,
            diningHallAmount: diningForInvoice,
            registrationAmount: registrationForInvoice,
            deskFeeAmount: deskForInvoice,
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
      message: classEntity ? 'Student registered and enrolled successfully' : 'Student registered successfully', 
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

export const correctStudentStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { studentStatus } = req.body as { studentStatus?: string };

    const normalizedIncoming = String(studentStatus || '').trim().toLowerCase();
    if (!normalizedIncoming) {
      return res.status(400).json({ message: 'studentStatus is required' });
    }

    const newStatus = normalizedIncoming.includes('new') ? 'New' : 'Existing';

    const studentRepository = AppDataSource.getRepository(Student);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const actionLogRepository = AppDataSource.getRepository(UserActionLog);

    const student = await studentRepository.findOne({ where: { id } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const previousStatus = String(student.studentStatus || 'New');
    if (previousStatus === newStatus) {
      return res.json({ message: 'Student status unchanged', student });
    }

    student.studentStatus = newStatus;
    await studentRepository.save(student);

    const initialInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'ASC' }
    });

    const settings = await settingsRepository.findOne({ where: {}, order: { createdAt: 'DESC' } });
    const fees = settings?.feesSettings || {};
    const deskFee = parseAmount((fees as any).deskFee);
    const registrationFee = parseAmount((fees as any).registrationFee);
    const dayScholarTuition = parseAmount((fees as any).dayScholarTuitionFee);
    const boarderTuition = parseAmount((fees as any).boarderTuitionFee);
    const transportCost = parseAmount((fees as any).transportCost);
    const diningHallCost = parseAmount((fees as any).diningHallCost);

    let financialImpact = {
      oldInvoiceAmount: 0,
      newInvoiceAmount: 0,
      deskFeeDelta: 0,
      oldBalance: 0,
      newBalance: 0,
      overpaymentMovedToPrepaid: 0,
      oldPaidAmount: 0,
      newPaidAmount: 0
    };

    if (initialInvoice && settings?.feesSettings) {
      const isDayScholar = student.studentType === 'Day Scholar';
      const staffSibling = isStaffSiblingExemption(student);

      let totalAmount = 0;
      const invoiceItems: string[] = [];

      if (!staffSibling) {
        if (newStatus === 'New') {
          if (registrationFee > 0) {
            totalAmount += registrationFee;
            invoiceItems.push(`Registration Fee: ${registrationFee}`);
          }
          if (deskFee > 0) {
            totalAmount += deskFee;
            invoiceItems.push(`Desk Fee: ${deskFee}`);
          }
        }

        const tuitionFee = isDayScholar ? dayScholarTuition : boarderTuition;
        if (tuitionFee > 0) {
          totalAmount += tuitionFee;
          invoiceItems.push(`Tuition Fee (${student.studentType}): ${tuitionFee}`);
        }

        if (isDayScholar && student.usesTransport && transportCost > 0) {
          totalAmount += transportCost;
          invoiceItems.push(`Transport Fee: ${transportCost}`);
        }

        if (isDayScholar && student.usesDiningHall && diningHallCost > 0) {
          totalAmount += diningHallCost;
          invoiceItems.push(`Dining Hall Fee: ${diningHallCost}`);
        }
      } else {
        if (isDayScholar && student.usesDiningHall && diningHallCost > 0) {
          const half = diningHallCost * 0.5;
          totalAmount += half;
          invoiceItems.push(`Dining Hall Fee (50%): ${half}`);
        }
      }

      totalAmount = parseFloat(totalAmount.toFixed(2));

      const oldAmount = parseAmount(initialInvoice.amount);
      const oldBalance = parseAmount(initialInvoice.balance);
      const paidAmountValue = parseAmount(initialInvoice.paidAmount);
      const oldPrepaid = parseAmount(initialInvoice.prepaidAmount);

      // When correcting status (e.g. New -> Existing), the desk fee (and any
      // other one‑time fees being removed) were NEVER actually paid. The
      // outstanding amount the student owes must therefore remain based on the
      // original invoice amount and the original cash paid.
      //
      // deskFeeDelta is the total reduction in invoice.amount (e.g. removing
      // desk fee, registration, etc.).
      const deskFeeDelta = parseFloat((oldAmount - totalAmount).toFixed(2));

      // Recompute balance from the original figures so that removing desk fee
      // does NOT reduce what the student still owes.
      //
      // newBalance = oldAmount - paidAmountValue
      // (i.e. "what they owe" stays the same; we are only cleaning out fees
      // that were never actually paid).
      let newBalance = Math.max(
        0,
        parseFloat((oldAmount - paidAmountValue).toFixed(2))
      );
      let overpay = 0;

      // If we are removing desk/registration fees due to a status correction,
      // the system must not show those removed charges as "paid" or as a "prepaid" credit.
      // Reduce paidAmount by the same delta (capped at 0) and do NOT add to prepaidAmount.
      let newPaidAmount = paidAmountValue;
      if (deskFeeDelta > 0 && paidAmountValue > 0) {
        newPaidAmount = Math.max(0, parseFloat((paidAmountValue - deskFeeDelta).toFixed(2)));
      }

      const description = invoiceItems.length > 0
        ? `Initial fees upon registration: ${invoiceItems.join(', ')}`
        : staffSibling && !student.usesDiningHall
          ? 'Staff sibling - no fees applicable'
          : 'Initial fees upon registration';

      initialInvoice.amount = totalAmount;
      initialInvoice.balance = newBalance;
      initialInvoice.description = description;
      initialInvoice.paidAmount = newPaidAmount;
      // Keep any existing prepaidAmount (from real overpayments), but never add prepaid from desk-fee removal.
      initialInvoice.prepaidAmount = oldPrepaid;
      if (newBalance <= 0) {
        initialInvoice.status = InvoiceStatus.PAID;
      } else if (newPaidAmount > 0) {
        initialInvoice.status = InvoiceStatus.PARTIAL;
      } else {
        initialInvoice.status = InvoiceStatus.PENDING;
      }

      await invoiceRepository.save(initialInvoice);

      financialImpact = {
        oldInvoiceAmount: oldAmount,
        newInvoiceAmount: totalAmount,
        deskFeeDelta: deskFeeDelta,
        oldBalance,
        newBalance,
        overpaymentMovedToPrepaid: 0,
        oldPaidAmount: paidAmountValue,
        newPaidAmount
      };
    }

    try {
      const actor = req.user;
      const metadata = JSON.stringify({
        studentId: student.id,
        studentNumber: student.studentNumber,
        previousStatus,
        newStatus,
        financialImpact
      });
      await actionLogRepository.save(
        actionLogRepository.create({
          userId: actor?.id || 'unknown',
          sessionId: (req.headers['x-session-id'] as string) || null,
          username: actor?.username || null,
          role: actor?.role || null,
          module: 'Finance',
          action: 'UPDATE',
          resourceType: 'StudentStatusCorrection',
          resourceId: student.id,
          metadata,
          ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket && (req.socket.remoteAddress || (req.connection as any)?.remoteAddress)) || (req as any).ip || null,
          userAgent: (req.headers['user-agent'] as string) || null
        })
      );
    } catch {
    }

    const refreshedStudent = await studentRepository.findOne({
      where: { id: student.id },
      relations: ['classEntity', 'parent']
    });

    res.json({
      message: 'Student status corrected successfully',
      student: refreshedStudent || student,
      financialImpact
    });
  } catch (error: any) {
    console.error('Correct student status error:', error);
    res.status(500).json({ message: 'Failed to correct student status', error: error.message });
  }
};

export const bulkCorrectStudentStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentIds, studentStatus } = req.body as { studentIds?: string[]; studentStatus?: string };
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds[] is required' });
    }
    const normalizedIncoming = String(studentStatus || '').trim().toLowerCase();
    if (!normalizedIncoming) {
      return res.status(400).json({ message: 'studentStatus is required' });
    }
    const newStatus = normalizedIncoming.includes('new') ? 'New' : 'Existing';

    const results: any[] = [];
    for (const id of studentIds) {
      try {
        const fakeReq: any = { ...req, params: { id }, body: { studentStatus: newStatus } };
        let jsonBody: any = null;
        const fakeRes: any = {
          status: (_c: number) => fakeRes,
          json: (b: any) => { jsonBody = b; return fakeRes; }
        };
        await correctStudentStatus(fakeReq, fakeRes);
        results.push({ studentId: id, ok: true, result: jsonBody });
      } catch (e: any) {
        results.push({ studentId: id, ok: false, error: e?.message || String(e) });
      }
    }

    res.json({
      message: 'Bulk status correction completed',
      count: results.length,
      results
    });
  } catch (error: any) {
    console.error('Bulk correct student status error:', error);
    res.status(500).json({ message: 'Failed bulk status correction', error: error.message });
  }
};

export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const {
      page: pageParam,
      limit: limitParam,
      classId,
      grade,
      search,
      studentType,
      usesTransport,
      usesDiningHall,
      unenrolled
    } = req.query;
    const { page, limit, skip } = resolvePaginationParams(
      pageParam as string,
      limitParam as string,
      1000
    );
    const trimmedClassId = classId ? String(classId).trim() : null;
    const trimmedGrade = grade ? String(grade).trim() : null;
    const trimmedSearch = search ? String(search).trim() : null;
    const normalizedStudentType = studentType ? String(studentType).trim() : null;
    const normalizedSearch = trimmedSearch ? trimmedSearch.toLowerCase() : null;
    const wantsUnenrolled = ['true', '1', 'yes', 'y'].includes(
      String(unenrolled ?? '').trim().toLowerCase()
    );

    let queryBuilder = studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.classEntity', 'classEntity');

    if (wantsUnenrolled) {
      queryBuilder = queryBuilder
        .andWhere('(student.isActive IS NULL OR student.isActive = :active)', { active: true })
        .andWhere('student.classId IS NULL');
    }

    if (trimmedClassId && !wantsUnenrolled) {
      queryBuilder = queryBuilder.andWhere(
        '(student.classId = :classId OR classEntity.id = :classId)',
        { classId: trimmedClassId }
      );
    }

    if (trimmedGrade) {
      queryBuilder = queryBuilder.andWhere(
        '(student.grade = :grade OR student.classLevel = :grade)',
        { grade: trimmedGrade }
      );
    }

    if (normalizedStudentType) {
      queryBuilder = queryBuilder.andWhere('student.studentType = :studentType', {
        studentType: normalizedStudentType
      });
    }

    if (usesTransport !== undefined) {
      const usesTransportFlag =
        typeof usesTransport === 'string'
          ? ['true', '1', 'yes', 'y'].includes(usesTransport.trim().toLowerCase())
          : Boolean(usesTransport);
      queryBuilder = queryBuilder.andWhere('student.usesTransport = :usesTransport', {
        usesTransport: usesTransportFlag
      });
    }

    if (usesDiningHall !== undefined) {
      const usesDiningHallFlag =
        typeof usesDiningHall === 'string'
          ? ['true', '1', 'yes', 'y'].includes(usesDiningHall.trim().toLowerCase())
          : Boolean(usesDiningHall);
      queryBuilder = queryBuilder.andWhere('student.usesDiningHall = :usesDiningHall', {
        usesDiningHall: usesDiningHallFlag
      });
    }

    if (normalizedSearch) {
      const like = `%${normalizedSearch}%`;
      queryBuilder = queryBuilder.andWhere(
        '(LOWER(student.firstName) LIKE :like OR LOWER(student.lastName) LIKE :like OR LOWER(student.studentNumber) LIKE :like OR LOWER(CONCAT(student.firstName, \' \', student.lastName)) LIKE :like OR LOWER(COALESCE(student.contactNumber, student.phoneNumber, \'\')) LIKE :like)',
        { like }
      );
    }

    let [students, total] = await queryBuilder
      .orderBy('student.lastName', 'ASC')
      .addOrderBy('student.firstName', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Fallback logic for legacy/inconsistent class data
    if (trimmedClassId && total === 0) {
      console.log('No students found with direct query, running legacy fallback...');
      const classRepository = AppDataSource.getRepository(Class);
      const fallbackStudents: Student[] = [];

      const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
      if (classEntity) {
        let fallbackQuery = studentRepository
          .createQueryBuilder('student')
          .leftJoinAndSelect('student.classEntity', 'classEntity')
          .leftJoinAndSelect('student.parent', 'parent')
          .leftJoinAndSelect('student.user', 'user')
          .where('classEntity.name = :className', { className: classEntity.name })
          .andWhere('(student.isActive IS NULL OR student.isActive = :active)', { active: true });

        if (normalizedSearch) {
          const like = `%${normalizedSearch}%`;
          fallbackQuery = fallbackQuery.andWhere(
            '(LOWER(student.firstName) LIKE :like OR LOWER(student.lastName) LIKE :like OR LOWER(student.studentNumber) LIKE :like OR LOWER(CONCAT(student.firstName, \' \', student.lastName)) LIKE :like OR LOWER(COALESCE(student.contactNumber, student.phoneNumber, \'\')) LIKE :like)',
            { like }
          );
        }

        const studentsByClassName = await fallbackQuery.getMany();

        console.log(`Fallback by class name found ${studentsByClassName.length} students`);

        if (studentsByClassName.length > 0) {
          for (const student of studentsByClassName) {
            if (student.classId !== trimmedClassId) {
              student.classId = trimmedClassId;
              await studentRepository.save(student);
              console.log(`Updated student ${student.firstName} ${student.lastName} classId to ${trimmedClassId}`);
            }
            fallbackStudents.push(student);
          }
        }
      }

      if (fallbackStudents.length === 0) {
        console.log('Fallback by class name failed, loading all students as last resort');
        const allStudents = await studentRepository.find({
          relations: ['classEntity', 'parent', 'user']
        });

        fallbackStudents.push(
          ...allStudents.filter(
            s =>
              (s.classId && s.classId === trimmedClassId) ||
              (s.classEntity && s.classEntity.id === trimmedClassId)
          )
        );
      }

      total = fallbackStudents.length;
      students = fallbackStudents.slice(skip, skip + limit);
    }

    console.log(`Returning ${students.length} students (page ${page}/${Math.max(1, Math.ceil(total / limit))})`);

    // Transform students to include 'class' property for frontend compatibility
    const transformedStudents = students.map(student => {
      const studentObj = student as any;
      // Add 'class' property that maps to 'classEntity' for frontend compatibility
      if (studentObj.classEntity && !studentObj.class) {
        studentObj.class = studentObj.classEntity;
      }
      return studentObj;
    });

    const statsQuery = studentRepository
      .createQueryBuilder('student')
      .leftJoin('student.classEntity', 'statsClass')
      .select("SUM(CASE WHEN student.studentType = 'Boarder' THEN 1 ELSE 0 END)", 'boarders')
      .addSelect("SUM(CASE WHEN student.studentType = 'Day Scholar' THEN 1 ELSE 0 END)", 'dayScholars')
      .addSelect("SUM(CASE WHEN student.isStaffChild = true THEN 1 ELSE 0 END)", 'staffChildren')
      .addSelect('COUNT(DISTINCT COALESCE(student.classId, statsClass.id))', 'classCount')
      .addSelect('COUNT(student.id)', 'totalStudents')
      .where('(student.isActive IS NULL OR student.isActive = :active)', { active: true });

    if (trimmedClassId) {
      statsQuery.andWhere(
        '(student.classId = :classId OR statsClass.id = :classId)',
        { classId: trimmedClassId }
      );
    }

    if (trimmedGrade) {
      statsQuery.andWhere(
        '(student.grade = :grade OR student.classLevel = :grade)',
        { grade: trimmedGrade }
      );
    }

    if (normalizedSearch) {
      const like = `%${normalizedSearch}%`;
      statsQuery.andWhere(
        '(LOWER(student.firstName) LIKE :statsLike OR LOWER(student.lastName) LIKE :statsLike OR LOWER(student.studentNumber) LIKE :statsLike OR LOWER(CONCAT(student.firstName, \' \', student.lastName)) LIKE :statsLike OR LOWER(COALESCE(student.contactNumber, student.phoneNumber, \'\')) LIKE :statsLike)',
        { statsLike: like }
      );
    }

    const statsRaw = await statsQuery.getRawOne();
    const stats = {
      totalBoarders: Number(statsRaw?.boarders ?? 0),
      totalDayScholars: Number(statsRaw?.dayScholars ?? 0),
      staffChildren: Number(statsRaw?.staffChildren ?? 0),
      classCount: Number(statsRaw?.classCount ?? 0),
      totalStudents: Number(statsRaw?.totalStudents ?? 0)
    };

    res.json(
      buildPaginationResponse(transformedStudents, total, page, limit, {
        stats
      })
    );
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
      relations: ['classEntity', 'parent', 'user', 'marks', 'invoices']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Transform student to include 'class' property for frontend compatibility
    const studentObj = student as any;
    if (studentObj.classEntity && !studentObj.class) {
      studentObj.class = studentObj.classEntity;
    }

    res.json(studentObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getLinkedParentsForStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Resolve the logged-in student (tolerant lookup)
    let student = req.user.student as any;
    if (!student) {
      const studentRepository = AppDataSource.getRepository(Student);
      student =
        (await studentRepository.findOne({ where: { user: { id: req.user.id } }, relations: ['user'] })) ||
        (await studentRepository.findOne({ where: { studentNumber: req.user.username }, relations: ['user'] })) ||
        null;
    }

    if (!student?.id) {
      return res.json({ parents: [] });
    }

    const parentStudentRepo = AppDataSource.getRepository(ParentStudent);
    const links = await parentStudentRepo.find({
      where: { studentId: student.id },
      relations: ['parent', 'parent.user'],
    });

    const parents = (links || [])
      .map(l => l.parent)
      .filter(Boolean)
      .map((p: Parent) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phoneNumber: p.phoneNumber,
        gender: p.gender,
        fullName: `${p.lastName || ''} ${p.firstName || ''}`.trim(),
      }));

    return res.json({ parents });
  } catch (error: any) {
    console.error('Error getting linked parents for student:', error);
    return res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
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
    const user = req.user as User | undefined;
    const userRole = user?.role;
    const isTeacherEditor = userRole === UserRole.TEACHER;
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      address,
      phoneNumber,
      contactNumber,
      studentType,
      studentStatus,
      usesTransport,
      usesDiningHall,
      isStaffChild,
      classId,
      parentId,
      photo,
      classLevel,
      grade
    } = req.body;

    console.log('Updating student with ID:', id);
    console.log('Received update data:', req.body);
    console.log('Editor role:', userRole || 'unknown');

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const parentRepository = AppDataSource.getRepository(Parent);

    const student = await studentRepository.findOne({ 
      where: { id },
      relations: ['classEntity']
    });

    if (!student) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Found student:', student.firstName, student.lastName);

    // Basic information - always editable by allowed roles (including teachers)
    if (firstName !== undefined && firstName !== null) {
      student.firstName = String(firstName).trim();
    }

    if (lastName !== undefined && lastName !== null) {
      student.lastName = String(lastName).trim();
    }

    // Date of birth - treated as basic profile information
    if (dateOfBirth !== undefined && dateOfBirth !== null) {
      const dobString = typeof dateOfBirth === 'string' ? dateOfBirth.trim() : dateOfBirth;

      // If empty string was sent, treat as clearing the DOB
      if (dobString === '') {
        student.dateOfBirth = null;
      } else {
        let parsedDate: Date;
        if (typeof dobString === 'string') {
          // Handle HTML date input format (YYYY-MM-DD)
          if (dobString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dobString.split('-').map(Number);
            parsedDate = new Date(year, month - 1, day);
          } else {
            parsedDate = new Date(dobString);
          }
        } else if (dobString instanceof Date) {
          parsedDate = dobString;
        } else {
          parsedDate = new Date(dobString as any);
        }

        if (!isNaN(parsedDate.getTime())) {
          student.dateOfBirth = parsedDate;
        } else {
          console.error('Invalid date format:', dateOfBirth);
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      }
    }

    // Gender - treated as basic profile information
    if (gender !== undefined && gender !== null) {
      student.gender = String(gender).trim();
    }

    // Address - treated as basic profile information
    if (address !== undefined) {
      student.address = address ? String(address).trim() : null;
    }

    // Contact and phone numbers - treated as contact information (teachers can edit)
    if (contactNumber !== undefined || phoneNumber !== undefined) {
      const finalContactNumber = contactNumber?.trim() || phoneNumber?.trim() || null;
      
      // Validate contact number if provided
      if (finalContactNumber) {
        const contactValidation = validatePhoneNumber(finalContactNumber, true);
        if (!contactValidation.isValid) {
          return res.status(400).json({ message: contactValidation.error || 'Invalid contact number' });
        }
        // Use normalized number if available
        student.contactNumber = contactValidation.normalized || finalContactNumber;
        student.phoneNumber = contactValidation.normalized || finalContactNumber;
      } else {
        student.contactNumber = null;
        student.phoneNumber = null;
      }
    }
    
    // Validate phoneNumber separately if it's different from contactNumber
    if (phoneNumber !== undefined && phoneNumber !== contactNumber && phoneNumber?.trim()) {
      const phoneValidation = validatePhoneNumber(phoneNumber, false);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.error || 'Invalid phone number' });
      }
      student.phoneNumber = phoneValidation.normalized || phoneNumber;
    }

    // Student type is basic student profile information and can be edited by teachers and staff
    if (studentType !== undefined && studentType !== null) {
      const normalizedStudentType = typeof studentType === 'string' ? studentType.trim().toLowerCase() : '';
      const validStudentType = normalizedStudentType === 'boarder' ? 'Boarder' : 'Day Scholar';
      student.studentType = validStudentType;
    }

    if (!isTeacherEditor && studentStatus !== undefined && studentStatus !== null) {
      const normalizedStatus = typeof studentStatus === 'string' ? studentStatus.trim().toLowerCase() : '';
      student.studentStatus = normalizedStatus.includes('existing') ? 'Existing' : 'New';
    }

    const logisticsBefore = snapshotFromStudent(student);
    const exemptionBefore = {
      isStaffChild: student.isStaffChild === true,
      isExempted: student.isExempted === true,
      exemptionType: student.exemptionType || null,
      exemptionAmount: student.exemptionAmount ?? null,
      exemptionPercent: student.exemptionPercent ?? null
    };

    if (!isTeacherEditor) {
      if (usesTransport !== undefined) {
        student.usesTransport = parseBoolean(usesTransport);
      }

      if (usesDiningHall !== undefined) {
        student.usesDiningHall = parseBoolean(usesDiningHall);
      }

      if (isStaffChild !== undefined) {
        student.isStaffChild = parseBoolean(isStaffChild);
      }

      if ((req.body as any).isExempted !== undefined) {
        student.isExempted = parseBoolean((req.body as any).isExempted);
      }

      if ((req.body as any).exemptionType !== undefined) {
        const t = (req.body as any).exemptionType;
        student.exemptionType = t ? String(t).trim() : null;
      }

      if ((req.body as any).exemptionAmount !== undefined) {
        const v = (req.body as any).exemptionAmount;
        student.exemptionAmount = v === null || v === '' ? null : Number(v);
      }

      if ((req.body as any).exemptionPercent !== undefined) {
        const v = (req.body as any).exemptionPercent;
        student.exemptionPercent = v === null || v === '' ? null : Number(v);
      }

      if ((req.body as any).exemptionDescription !== undefined) {
        const d = (req.body as any).exemptionDescription;
        student.exemptionDescription = d ? String(d).trim() : null;
      }

      if (isStaffSiblingExemption(student)) {
        student.usesTransport = false;
      }
    }

    // Handle photo upload or update - allow teachers to update profile photo
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

    // Class, grade and parent associations are sensitive – prevent teachers from editing them
    if (!isTeacherEditor) {
      // Update classId if provided (allow clearing to un-enroll)
      if (classId !== undefined) {
        if (classId === null || classId === '') {
          student.classId = null;
          (student as any).classEntity = null as any;
        } else {
          const trimmedClassId = String(classId).trim();
          const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
          if (!classEntity) {
            console.error('Class not found with ID:', trimmedClassId);
            return res.status(404).json({ message: 'Class not found' });
          }
          const oldClassId = student.classId;
          const oldClassName = student.classEntity?.name || 'N/A';
          
          student.classId = trimmedClassId;
          student.classEntity = classEntity;
          
          console.log('Updating student class from', oldClassName, '(ID: ' + oldClassId + ') to:', classEntity.name, '(ID: ' + trimmedClassId + ')');
          console.log('Setting student.classEntity relation to:', classEntity.name);
        }
      }

      // Update grade/classLevel (Grade) if provided
      if (classLevel !== undefined || grade !== undefined) {
        const normalized =
          (grade && String(grade).trim()) ||
          (classLevel && String(classLevel).trim()) ||
          '';
        (student as any).classLevel = normalized ? normalized : null;
        (student as any).grade = normalized ? normalized : null;
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
    }

    console.log('Saving updated student...');
    console.log('Student classId before save:', student.classId);
    console.log('Student classEntity relation before save:', student.classEntity?.name || 'null');

    const logisticsAfterPreview = snapshotFromStudent(student);
    const shouldSyncLogistics =
      !isTeacherEditor && logisticsProfileChanged(logisticsBefore, logisticsAfterPreview);

    let updatedStudent: Student | null = null;
    let logisticsInvoiceSync: any = null;
    let exemptionInvoiceSync: any = null;

    try {
      await AppDataSource.transaction(async (manager) => {
        const txStudentRepo = manager.getRepository(Student);
        const savedStudent = await txStudentRepo.save(student);
        console.log('Student classId after save:', savedStudent.classId);

        if (classId !== undefined) {
          if (classId === null || classId === '') {
            await txStudentRepo.update({ id }, { classId: null });
            console.log('Explicitly cleared classId via update query');
          } else {
            const trimmedClassId = String(classId).trim();
            await txStudentRepo.update({ id }, { classId: trimmedClassId });
            console.log('Explicitly updated classId via update query:', trimmedClassId);
          }
        }

        updatedStudent = await txStudentRepo.findOne({
          where: { id },
          relations: ['classEntity', 'parent']
        });

        if (!updatedStudent) {
          throw new Error('Failed to reload student after update');
        }

        const settingsRepository = manager.getRepository(Settings);
        const settings = await settingsRepository.findOne({ where: {}, order: { createdAt: 'DESC' } });
        const fees = settings?.feesSettings;

        if (fees && shouldSyncLogistics) {
          logisticsInvoiceSync = await syncStudentLogisticsInvoices({
            studentId: updatedStudent.id,
            before: logisticsBefore,
            after: snapshotFromStudent(updatedStudent),
            fees: fees as Record<string, unknown>,
            activeTerm: settings?.activeTerm || settings?.currentTerm,
            manager
          });
        }

        if (fees && !isTeacherEditor) {
          const repaired = await repairStaleLogisticsInvoiceBalances(updatedStudent.id, manager);
          if (repaired > 0) {
            logisticsInvoiceSync = logisticsInvoiceSync ?? {
              updatedInvoices: 0,
              adjustments: [],
              deltaTransport: 0,
              deltaDiningHall: 0
            };
            logisticsInvoiceSync.repairedInvoices = repaired;
          }
        }

        const exemptionAfter = {
          isStaffChild: updatedStudent.isStaffChild === true,
          isExempted: updatedStudent.isExempted === true,
          exemptionType: updatedStudent.exemptionType || null,
          exemptionAmount: updatedStudent.exemptionAmount ?? null,
          exemptionPercent: updatedStudent.exemptionPercent ?? null
        };

        const exemptionFieldsChanged =
          exemptionBefore.isStaffChild !== exemptionAfter.isStaffChild ||
          exemptionBefore.isExempted !== exemptionAfter.isExempted ||
          exemptionBefore.exemptionType !== exemptionAfter.exemptionType ||
          Number(exemptionBefore.exemptionAmount ?? 0) !== Number(exemptionAfter.exemptionAmount ?? 0) ||
          Number(exemptionBefore.exemptionPercent ?? 0) !== Number(exemptionAfter.exemptionPercent ?? 0);

        const exemptionWasActive =
          exemptionBefore.isStaffChild ||
          (exemptionBefore.isExempted &&
            (exemptionBefore.exemptionType === 'fixed' || exemptionBefore.exemptionType === 'percentage'));

        const exemptionIsActive =
          isStaffSiblingExemption(updatedStudent) || isBalanceOnlyExemption(updatedStudent);

        if (fees && !isTeacherEditor && (exemptionFieldsChanged || exemptionWasActive || exemptionIsActive)) {
          exemptionInvoiceSync = await syncExemptionInvoicesForStudent(updatedStudent.id, { manager });
        }
      });
    } catch (txError: any) {
      console.error('Student update transaction failed:', txError);
      const message =
        txError?.message ||
        'Failed to update student record and invoice balances. No changes were saved.';
      return res.status(500).json({ message, error: message });
    }

    if (!updatedStudent) {
      return res.status(500).json({ message: 'Failed to reload student after update' });
    }

    console.log('Student updated successfully');
    console.log('Updated student classId:', updatedStudent.classId);
    console.log('Updated student classEntity name:', updatedStudent.classEntity?.name || 'N/A');
    console.log('Updated student classEntity id:', updatedStudent.classEntity?.id || 'N/A');
    
    try {
      const invoiceRepository = AppDataSource.getRepository(Invoice);
      const settingsRepository = AppDataSource.getRepository(Settings);

      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: updatedStudent.id },
        order: { createdAt: 'DESC' }
      });

      if (latestInvoice) {
        const previousBalanceValue = parseAmount(latestInvoice.previousBalance);
        const prepaidAmountValue = parseAmount(latestInvoice.prepaidAmount);
        const isInitialDescription = String(latestInvoice.description || '').includes('Initial fees upon registration');
        const isInitialInvoice = previousBalanceValue === 0 && prepaidAmountValue === 0 && isInitialDescription;

        if (isInitialInvoice) {
          const settings = await settingsRepository.findOne({
            where: {},
            order: { createdAt: 'DESC' }
          });

          if (settings && settings.feesSettings) {
            const fees = settings.feesSettings;

            applyExemptionToInvoice(
              updatedStudent,
              latestInvoice,
              fees as Record<string, unknown>
            );
            await invoiceRepository.save(latestInvoice);
            console.log('✅ Recalculated initial invoice after student update');
          }
        }
      }
    } catch (autoInvoiceError) {
      console.error('⚠️ Auto-invoice recalculation failed:', autoInvoiceError);
    }

    // If the student has no invoice yet, create initial invoice depending on status
    try {
      const invoiceRepository = AppDataSource.getRepository(Invoice);
      const settingsRepository = AppDataSource.getRepository(Settings);
      const invoiceCount = await invoiceRepository.count({ where: { studentId: updatedStudent.id } });
      if (invoiceCount === 0) {
        const settings = await settingsRepository.findOne({ where: {}, order: { createdAt: 'DESC' } });
        const fees = settings?.feesSettings || {};
        const feesRecord = fees as Record<string, unknown>;
        const draftInvoice = invoiceRepository.create({
          invoiceNumber: 'TEMP',
          studentId: updatedStudent.id,
          amount: 0,
          previousBalance: 0,
          paidAmount: 0,
          balance: 0,
          prepaidAmount: 0,
          uniformTotal: 0,
          dueDate: new Date(),
          term: settings?.activeTerm || settings?.currentTerm || `Term 1 ${new Date().getFullYear()}`,
          description: 'Initial fees upon registration',
          status: InvoiceStatus.PENDING,
          uniformItems: []
        });
        applyExemptionToInvoice(updatedStudent, draftInvoice, feesRecord);
        const totalAmount = parseAmount(draftInvoice.amount);

        if (totalAmount > 0) {
          const currentYear = new Date().getFullYear();
          const invoicePrefix = `INV-${currentYear}-`;
          const lastInvoiceForYear = await invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.invoiceNumber LIKE :prefix', { prefix: `${invoicePrefix}%` })
            .orderBy('invoice.invoiceNumber', 'DESC')
            .getOne();
          let nextSeq = 1;
          if (lastInvoiceForYear?.invoiceNumber) {
            const parts = String(lastInvoiceForYear.invoiceNumber).split('-');
            const seq = parseInt(parts[2] || '1', 10);
            if (!isNaN(seq) && seq >= 1) nextSeq = seq + 1;
          }
          const invoiceNumber = `${invoicePrefix}${String(nextSeq).padStart(6, '0')}`;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          const termText = settings?.activeTerm || settings?.currentTerm || `Term 1 ${currentYear}`;
          draftInvoice.invoiceNumber = invoiceNumber;
          draftInvoice.dueDate = dueDate;
          draftInvoice.term = termText;
          await invoiceRepository.save(draftInvoice);
          console.log('✅ Created initial invoice for existing student without invoice:', invoiceNumber);
        } else {
          console.log('ℹ️ No initial invoice created (total amount 0)');
        }
      }
    } catch (initInvoiceError) {
      console.error('⚠️ Initial invoice creation failed:', initInvoiceError);
    }

    res.json({
      message: 'Student updated successfully',
      student: updatedStudent,
      logisticsInvoiceSync,
      exemptionInvoiceSync
    });
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
      relations: ['classEntity']
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

async function purgeStudentDependencies(manager: EntityManager, studentId: string): Promise<void> {
  await manager.delete(ReportCardRemarks, { studentId });
  await manager.delete(Marks, { studentId });
  await manager.delete(ExamStudentPassRateInclusion, { studentId });
  await manager.delete(Attendance, { studentId });
  await manager.delete(RecordBook, { studentId });
  await manager.delete(ElearningResponse, { studentId });
  await manager.delete(InventoryFine, { studentId });
  await manager.delete(InventoryTextbookIssuance, { studentId });
  await manager.delete(InventoryFurnitureIssuance, { studentId });
  await manager.delete(UniformPaymentLog, { studentId });
  await manager.delete(ParentStudent, { studentId });
  await manager.delete(ElearningTask, { studentId });

  const uniformCharges = await manager.find(UniformCharge, {
    where: { studentId },
    select: ['id'],
  });
  const uniformChargeIds = uniformCharges.map((c) => c.id);
  if (uniformChargeIds.length > 0) {
    await manager.delete(UniformChargeItem, { uniformChargeId: In(uniformChargeIds) });
    await manager.delete(UniformCharge, { id: In(uniformChargeIds) });
  }

  const invoices = await manager.find(Invoice, {
    where: { studentId },
    select: ['id'],
  });
  const invoiceIds = invoices.map((inv) => inv.id);
  if (invoiceIds.length > 0) {
    await manager.delete(InvoiceUniformItem, { invoiceId: In(invoiceIds) });
    await manager
      .createQueryBuilder()
      .delete()
      .from(PaymentLog)
      .where('invoiceId IN (:...invoiceIds)', { invoiceIds })
      .execute();
  }
  await manager.delete(PaymentLog, { studentId });
  await manager.delete(Invoice, { studentId });
  await manager.delete(StudentTransfer, { studentId });
}

export const deleteStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete student with ID:', id);

    const deleted = await AppDataSource.transaction(async (manager) => {
      const studentRepository = manager.getRepository(Student);
      const userRepository = manager.getRepository(User);

      const student = await studentRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!student) {
        return null;
      }

      console.log('Found student:', student.firstName, student.lastName, `(${student.studentNumber})`);

      await purgeStudentDependencies(manager, id);

      const userId = student.userId || student.user?.id;
      if (userId) {
        console.log('Deleting associated user account:', userId);
        await userRepository.delete({ id: userId });
      }

      console.log('Deleting student:', student.firstName, student.lastName);
      await studentRepository.delete({ id });
      return student;
    });

    if (!deleted) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Student deleted successfully');
    res.json({ message: 'Student deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      message: error?.message || 'Server error while deleting student',
      error: error.message,
    });
  }
};

export const transferStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { 
      studentId, 
      toClassId, 
      targetClassId, // Frontend uses targetClassId
      reason, 
      transferReason, // Frontend uses transferReason
      transferType,
      transferDate, // Frontend sends transferDate
      externalSchoolName,
      destinationSchool, // Frontend uses destinationSchool
      externalSchoolAddress,
      externalSchoolPhone,
      externalSchoolEmail
    } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const transferRepository = AppDataSource.getRepository(StudentTransfer);

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity', 'parent', 'user']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Determine transfer type - support both frontend and backend formats
    const finalToClassId = toClassId || targetClassId;
    const finalReason = reason || transferReason;
    const finalDestinationSchool = externalSchoolName || destinationSchool;
    
    const isExternalTransfer = transferType === TransferType.EXTERNAL || 
                               (!finalToClassId && (finalDestinationSchool || externalSchoolAddress));

    // Validate based on transfer type
    if (isExternalTransfer) {
      // External transfer validation
      if (!finalDestinationSchool || !finalDestinationSchool.trim()) {
        return res.status(400).json({ message: 'Destination school name is required for external transfers' });
      }

      // Validate external school phone if provided
      if (externalSchoolPhone && externalSchoolPhone.trim()) {
        const phoneValidation = validatePhoneNumber(externalSchoolPhone, false);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ message: phoneValidation.error || 'Invalid external school phone number' });
        }
      }
    } else {
      // Internal transfer validation
      if (!finalToClassId) {
        return res.status(400).json({ message: 'Target class ID is required for internal transfers' });
      }

      const targetClass = await classRepository.findOne({ where: { id: finalToClassId } });
      if (!targetClass) {
        return res.status(404).json({ message: 'Target class not found' });
      }

      const currentClassId = student.classId || student.classEntity?.id || null;
      if (currentClassId && currentClassId === finalToClassId) {
        return res.status(400).json({ message: 'Student is already enrolled in the selected class' });
      }
    }

    const currentClassId = student.classId || student.classEntity?.id || null;

    // Create transfer record
    const transferData: any = {
      studentId: student.id,
      fromClassId: currentClassId,
      toClassId: isExternalTransfer ? null : finalToClassId,
      reason: finalReason || null,
      performedByUserId: req.user?.id || null,
      status: StudentTransferStatus.COMPLETED,
      transferType: isExternalTransfer ? TransferType.EXTERNAL : TransferType.INTERNAL
    };

    // Add external transfer fields if applicable
    if (isExternalTransfer) {
      transferData.externalSchoolName = finalDestinationSchool?.trim() || null;
      transferData.externalSchoolAddress = externalSchoolAddress?.trim() || null;
      transferData.externalSchoolPhone = externalSchoolPhone?.trim() || null;
      transferData.externalSchoolEmail = externalSchoolEmail?.trim() || null;
      // Store transfer date if provided (we'll use createdAt for the actual date)
      if (transferDate) {
        // The transferDate will be used to set createdAt if needed
      }
    }

    const transfer = transferRepository.create(transferData);
    const savedTransfer = await transferRepository.save(transfer);

    // For internal transfers, update student's class
    // For external transfers, mark student as inactive but keep them in their last class
    if (isExternalTransfer) {
      // Mark student as inactive (transferred out) but keep class assignment
      // This ensures all students maintain a class assignment as required
      student.isActive = false;
      // Keep student.classId unchanged - they remain in their last class
      await studentRepository.save(student);
    } else {
      // Update student's class for internal transfer
      student.classId = finalToClassId;
      await studentRepository.save(student);
    }

    res.json({
      message: isExternalTransfer 
        ? 'Student transferred to external school successfully' 
        : 'Student transferred successfully',
      transfer: savedTransfer,
      student
    });
  } catch (error: any) {
    console.error('Error transferring student:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getStudentTransfers = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const transferRepository = AppDataSource.getRepository(StudentTransfer);

    const transfers = await transferRepository.find({
      where: { studentId: id },
      relations: ['fromClass', 'toClass', 'performedBy'],
      order: { createdAt: 'DESC' }
    });

    // Format response to include user-friendly data
    const formattedTransfers = transfers.map(transfer => ({
      id: transfer.id,
      studentId: transfer.studentId,
      transferType: transfer.transferType,
      fromClass: transfer.fromClass ? { id: transfer.fromClass.id, name: transfer.fromClass.name } : null,
      toClass: transfer.toClass ? { id: transfer.toClass.id, name: transfer.toClass.name } : null,
      oldClass: transfer.fromClass?.name || null,
      newClass: transfer.toClass?.name || null,
      destinationSchool: transfer.externalSchoolName,
      transferReason: transfer.reason,
      transferDate: transfer.createdAt,
      createdAt: transfer.createdAt,
      transferredBy: transfer.performedBy ? (transfer.performedBy.username || transfer.performedBy.email || 'Unknown User') : null
    }));

    res.json(formattedTransfers);
  } catch (error: any) {
    console.error('Error fetching student transfer history:', error);
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
      relations: ['classEntity', 'parent']
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
      where: {},
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

export const generateStudentTransportIdCard = async (req: AuthRequest, res: Response) => {
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
      relations: ['classEntity', 'parent']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (!student.usesTransport || student.studentType !== 'Day Scholar') {
      return res.status(400).json({ message: 'This student does not use school transport' });
    }

    const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
    if (!allowedRoles.includes(user.role)) {
      if (user.role === UserRole.PARENT) {
        const parent = await parentRepository.findOne({ where: { userId: user.id } });
        if (!parent || student.parentId !== parent.id) {
          return res.status(403).json({ message: 'You do not have permission to view this student\'s bus ID card' });
        }
      } else {
        return res.status(403).json({
          message: 'Insufficient permissions to view bus ID cards. Required role: Admin, Super Admin, Accountant, or Teacher.',
          userRole: user.role,
          allowedRoles
        });
      }
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const qrPayload = {
      studentId: student.id,
      studentNumber: student.studentNumber,
      name: `${student.firstName} ${student.lastName}`.trim(),
      class: student.classEntity?.name || null,
      studentType: student.studentType,
      issuedAt: new Date().toISOString(),
      transport: true
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));

    const pdfBuffer = await createStudentIdCardPDF({
      student,
      settings: settings || null,
      qrDataUrl,
      photoPath: student.photo,
      mode: 'transport'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${student.studentNumber || 'student'}-bus-id-card.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating transport bus ID card:', error);
    return res.status(500).json({ message: 'Failed to generate transport bus ID card' });
  }
};
export const generateTransportBusIdCards = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        message: 'Insufficient permissions to generate transport bus ID cards. Required role: Admin, Super Admin, Accountant, or Teacher.',
        userRole: user.role,
        allowedRoles
      });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const { classId } = req.query as { classId?: string };

    const query = studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.classEntity', 'classEntity')
      .where('student.usesTransport = :usesTransport', { usesTransport: true })
      .andWhere('student.studentType = :studentType', { studentType: 'Day Scholar' });

    if (classId) {
      query.andWhere('classEntity.id = :classId', { classId });
    }

    const students = await query
      .orderBy('classEntity.name', 'ASC')
      .addOrderBy('student.lastName', 'ASC')
      .addOrderBy('student.firstName', 'ASC')
      .getMany();

    if (!students.length) {
      return res.status(404).json({ message: 'No day scholar students using transport found' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const cardItems = await Promise.all(
      students.map(async (student) => {
        const qrPayload = {
          studentId: student.id,
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`.trim(),
          class: student.classEntity?.name || null,
          studentType: student.studentType,
          issuedAt: new Date().toISOString(),
          transport: true
        };

        const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));

        return {
          student,
          settings: settings || null,
          qrDataUrl,
          photoPath: student.photo,
          mode: 'transport' as const
        };
      })
    );

    const pdfBuffer = await createStudentIdCardsPDFBatch(cardItems);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="transport-bus-id-cards.pdf"');
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating transport bus ID cards:', error);
    return res.status(500).json({ message: 'Failed to generate transport bus ID cards' });
  }
};

async function generateLogisticsReportHtml(
  req: AuthRequest,
  res: Response,
  options: { service: 'transport' | 'diningHall'; title: string }
) {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({
      message: 'Insufficient permissions to generate logistics reports. Required role: Admin, Super Admin, Accountant, or Teacher.',
      userRole: user.role,
      allowedRoles
    });
  }

  const studentRepository = AppDataSource.getRepository(Student);
  const settingsRepository = AppDataSource.getRepository(Settings);
  const classRepository = AppDataSource.getRepository(Class);

  const { classId } = req.query as { classId?: string };
  const preview = String(req.query.preview || '').toLowerCase() === 'true';

  const query = studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where('student.studentType = :studentType', { studentType: 'Day Scholar' });

  if (options.service === 'transport') {
    query.andWhere('student.usesTransport = :flag', { flag: true });
  } else {
    query.andWhere('student.usesDiningHall = :flag', { flag: true });
  }

  if (classId) {
    query.andWhere('classEntity.id = :classId', { classId });
  }

  const students = await query
    .orderBy('classEntity.name', 'ASC')
    .addOrderBy('student.lastName', 'ASC')
    .addOrderBy('student.firstName', 'ASC')
    .getMany();

  const settings = await settingsRepository.findOne({
    where: {},
    order: { createdAt: 'DESC' }
  });

  let classFilterLabel: string | null = null;
  if (classId) {
    const cls = await classRepository.findOne({ where: { id: classId } });
    classFilterLabel = cls?.name ? String(cls.name).trim() : 'Selected class';
  }

  const schoolName = settings?.schoolName || 'School Management System';
  const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
  const schoolMotto = settings?.schoolMotto ? String(settings.schoolMotto).trim() : '';
  const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
  const schoolEmail = settings?.schoolEmail ? String(settings.schoolEmail).trim() : '';
  const schoolLogo = (settings as any)?.schoolLogo ?? null;

  const rows: LogisticsReportRow[] = students.map((student) => {
    const lastName = (student.lastName || '').trim() || '—';
    const firstName = (student.firstName || '').trim() || '—';
    const contact = (student.contactNumber || student.phoneNumber || '').trim();
    const displayClass = extractGradeLabel(student.classEntity?.name) || '';
    return {
      studentNumber: (student.studentNumber || '').trim() || '—',
      lastName,
      firstName,
      className: displayClass,
      contact,
    };
  });

  const htmlBuffer = createLogisticsReportHTMLBuffer({
    schoolName,
    schoolMotto,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolLogo: schoolLogo != null ? String(schoolLogo).trim() : null,
    reportTitle: options.title,
    serviceType: options.service,
    reportDate: new Date(),
    classFilterLabel,
    rows,
  });

  const slug = options.service === 'transport' ? 'Transport' : 'Dining_Hall';
  const filename = `${slug}_Students_Report.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.send(htmlBuffer);
}

export const generateTransportStudentsReport = async (req: AuthRequest, res: Response) => {
  try {
    await generateLogisticsReportHtml(req, res, {
      service: 'transport',
      title: 'Students Using School Transport'
    });
  } catch (error) {
    console.error('Error generating transport students report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate transport students report' });
    }
  }
};

export const generateDiningHallStudentsReport = async (req: AuthRequest, res: Response) => {
  try {
    await generateLogisticsReportHtml(req, res, {
      service: 'diningHall',
      title: 'Students Using Dining Hall'
    });
  } catch (error) {
    console.error('Error generating dining hall students report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate dining hall students report' });
    }
  }
};
