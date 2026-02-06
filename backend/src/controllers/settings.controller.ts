import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Settings } from '../entities/Settings';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { Marks } from '../entities/Marks';
import { Attendance } from '../entities/Attendance';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { RecordBook } from '../entities/RecordBook';
import { StudentTransfer } from '../entities/StudentTransfer';
import { Timetable } from '../entities/Timetable';
import { TimetableEntry } from '../entities/TimetableEntry';
import { TimetableVersion } from '../entities/TimetableVersion';
import { TimetableChangeLog } from '../entities/TimetableChangeLog';
import { TeacherClass } from '../entities/TeacherClass';
import { Message } from '../entities/Message';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';

const DEFAULT_MODULE_ACCESS: Settings['moduleAccess'] = {
  universalTeacher: {
    students: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: false,
    settings: false
  },
  teachers: {
    students: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: false,
    settings: false
  },
  parents: {
    reportCards: true,
    invoices: true,
    dashboard: true
  },
  accountant: {
    students: true,
    invoices: true,
    finance: true,
    dashboard: true,
    settings: false
  },
  admin: {
    students: true,
    teachers: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: true,
    attendance: true,
    settings: true,
    dashboard: true
  },
  students: {
    dashboard: true,
    subjects: true,
    assignments: true,
    reportCards: true,
    finance: false
  },
  demoAccount: {
    dashboard: true,
    students: true,
    teachers: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: true,
    attendance: true,
    assignments: true,
    messages: true,
    accounts: true,
    settings: false
  }
};

const ensureModuleAccessDefaults = (current?: Settings['moduleAccess'] | null): Settings['moduleAccess'] => {
  const existing = current || {};
  return {
    universalTeacher: { ...DEFAULT_MODULE_ACCESS?.universalTeacher, ...(existing.universalTeacher || {}) },
    teachers: { ...DEFAULT_MODULE_ACCESS?.teachers, ...(existing.teachers || {}) },
    parents: { ...DEFAULT_MODULE_ACCESS?.parents, ...(existing.parents || {}) },
    accountant: { ...DEFAULT_MODULE_ACCESS?.accountant, ...(existing.accountant || {}) },
    admin: { ...DEFAULT_MODULE_ACCESS?.admin, ...(existing.admin || {}) },
    students: { ...DEFAULT_MODULE_ACCESS?.students, ...(existing.students || {}) },
    demoAccount: { ...DEFAULT_MODULE_ACCESS?.demoAccount, ...(existing.demoAccount || {}) }
  };
};

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    
    // Get the first (and only) settings record, or create default if none exists
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    let settings = settingsList.length > 0 ? settingsList[0] : null;

    if (!settings) {
      try {
        // Create default settings
        settings = settingsRepository.create({
          studentIdPrefix: 'JPS',
          feesSettings: {
            dayScholarTuitionFee: 0,
            boarderTuitionFee: 0,
            registrationFee: 0,
            deskFee: 0,
            libraryFee: 0,
            sportsFee: 0,
            transportCost: 0,
            diningHallCost: 0,
            otherFees: []
          },
          gradeThresholds: {
            excellent: 90,
            veryGood: 80,
            good: 70,
            satisfactory: 60,
            needsImprovement: 50
          },
          academicYear: new Date().getFullYear().toString(),
          currentTerm: `Term 1 ${new Date().getFullYear()}`,
          currencySymbol: 'KES',
          moduleAccess: ensureModuleAccessDefaults()
        });
        await settingsRepository.save(settings);
      } catch (createError: any) {
        console.error('Error creating default settings:', createError);
        // If we can't create settings, return default object
        return res.json({
          studentIdPrefix: 'JPS',
          feesSettings: {
            dayScholarTuitionFee: 0,
            boarderTuitionFee: 0,
            registrationFee: 0,
            deskFee: 0,
            libraryFee: 0,
            sportsFee: 0,
            transportCost: 0,
            diningHallCost: 0,
            otherFees: []
          },
          gradeThresholds: {
            excellent: 90,
            veryGood: 80,
            good: 70,
            satisfactory: 60,
            needsImprovement: 50
          },
          academicYear: new Date().getFullYear().toString(),
          currentTerm: `Term 1 ${new Date().getFullYear()}`,
          currencySymbol: 'KES',
          moduleAccess: ensureModuleAccessDefaults()
        });
      }
    } else if (settings.feesSettings) {
      // Migrate old tuitionFee to both dayScholarTuitionFee and boarderTuitionFee
      const feesSettingsAny = settings.feesSettings as any;
      if (feesSettingsAny.tuitionFee !== undefined &&
          settings.feesSettings.dayScholarTuitionFee === undefined &&
          settings.feesSettings.boarderTuitionFee === undefined) {
        const oldTuitionFee = feesSettingsAny.tuitionFee;
        settings.feesSettings.dayScholarTuitionFee = oldTuitionFee;
        settings.feesSettings.boarderTuitionFee = oldTuitionFee;
        delete feesSettingsAny.tuitionFee;
        await settingsRepository.save(settings);
      }
    }

    // Include school name from settings if available
    const responsePayload: any = { ...settings };
    responsePayload.moduleAccess = ensureModuleAccessDefaults(settings?.moduleAccess);

    // For demo users, always return "Demo School" as school name/code
    const isDemo = req.user?.isDemo === true || req.user?.email === 'demo@school.com' || req.user?.username === 'demo@school.com';
    
    if (isDemo) {
      responsePayload.schoolName = 'Demo School';
      responsePayload.schoolCode = 'demo';
      return res.json(responsePayload);
    }

    res.json(responsePayload);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    console.error('Error stack:', error?.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error?.message || 'Unknown error' 
    });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    // Prevent demo users from changing settings
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot modify system settings. This is a demo environment.' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    
    // Get existing settings or create new
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    let settings = settingsList.length > 0 ? settingsList[0] : null;

    const {
      studentIdPrefix,
      feesSettings,
      gradeThresholds,
      gradeLabels,
      schoolLogo,
      schoolLogo2,
      schoolName,
      schoolCode,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      headmasterName,
      schoolMotto,
      academicYear,
      currentTerm,
      activeTerm,
      termStartDate,
      termEndDate,
      currencySymbol,
      moduleAccess,
      universalTeacherEnabled,
      schoolStartTime,
      schoolEndTime,
      breakTimes
    } = req.body;

    if (!settings) {
      settings = settingsRepository.create({});
    }

    // Update fields
    if (studentIdPrefix !== undefined) {
      settings.studentIdPrefix = String(studentIdPrefix).trim();
    }
    if (feesSettings !== undefined) {
      // Migrate old tuitionFee to both dayScholarTuitionFee and boarderTuitionFee if needed
      const feesSettingsAny = feesSettings as any;
      if (feesSettingsAny.tuitionFee !== undefined && 
          feesSettings.dayScholarTuitionFee === undefined &&
          feesSettings.boarderTuitionFee === undefined) {
        const oldTuitionFee = feesSettingsAny.tuitionFee;
        feesSettings.dayScholarTuitionFee = oldTuitionFee;
        feesSettings.boarderTuitionFee = oldTuitionFee;
        delete feesSettingsAny.tuitionFee;
      }
      if (feesSettings.registrationFee === undefined) {
        feesSettings.registrationFee = 0;
      }
      if (feesSettings.deskFee === undefined) {
        feesSettings.deskFee = 0;
      }
      settings.feesSettings = feesSettings;
    } else if (settings.feesSettings) {
      // Handle existing settings with old tuitionFee
      const feesSettingsAny = settings.feesSettings as any;
      if (feesSettingsAny.tuitionFee !== undefined &&
          settings.feesSettings.dayScholarTuitionFee === undefined &&
          settings.feesSettings.boarderTuitionFee === undefined) {
        const oldTuitionFee = feesSettingsAny.tuitionFee;
        settings.feesSettings.dayScholarTuitionFee = oldTuitionFee;
        settings.feesSettings.boarderTuitionFee = oldTuitionFee;
        delete feesSettingsAny.tuitionFee;
      }
      if (settings.feesSettings.registrationFee === undefined) {
        settings.feesSettings.registrationFee = 0;
      }
      if (settings.feesSettings.deskFee === undefined) {
        settings.feesSettings.deskFee = 0;
      }
    }
    if (gradeThresholds !== undefined) {
      settings.gradeThresholds = gradeThresholds;
    }
    if (gradeLabels !== undefined) {
      settings.gradeLabels = gradeLabels;
    }
    if (schoolLogo !== undefined) {
      settings.schoolLogo = schoolLogo;
    }
    if (schoolLogo2 !== undefined) {
      settings.schoolLogo2 = schoolLogo2;
    }
    // Update school name if provided
    if (schoolName !== undefined && schoolName !== null) {
      const trimmedName = String(schoolName).trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'School name cannot be empty.' });
      }
      settings.schoolName = trimmedName;
    }
    if (schoolAddress !== undefined) {
      settings.schoolAddress = schoolAddress;
    }
    if (schoolPhone !== undefined) {
      // For school phone, allow free-form text with labels (e.g., "Telephones: Landline-+263 392 263 293, Headmistress-+263 786 044 502")
      // Only validate that it doesn't contain obviously invalid characters
      if (schoolPhone && schoolPhone.trim()) {
        const trimmedPhone = schoolPhone.trim();
        // Allow: letters, numbers, spaces, dashes, colons, commas, plus signs, parentheses
        const allowedPattern = /^[a-zA-Z0-9\s\-:,\+()]+$/;
        
        if (!allowedPattern.test(trimmedPhone)) {
          return res.status(400).json({ 
            message: 'School phone information can only contain letters, numbers, spaces, and common punctuation (dashes, colons, commas, plus signs, parentheses)' 
          });
        }
        
        // Store the trimmed text as-is (no normalization for free-form format)
        settings.schoolPhone = trimmedPhone;
      } else {
        settings.schoolPhone = null;
      }
    }
    if (schoolEmail !== undefined) {
      settings.schoolEmail = schoolEmail;
    }
    if (headmasterName !== undefined) {
      settings.headmasterName = headmasterName;
    }
    if (schoolMotto !== undefined) {
      settings.schoolMotto = schoolMotto;
    }
    if (academicYear !== undefined) {
      settings.academicYear = academicYear;
    }
    if (currentTerm !== undefined) {
      settings.currentTerm = currentTerm;
    }
    if (activeTerm !== undefined) {
      settings.activeTerm = activeTerm;
    }
    if (termStartDate !== undefined) {
      settings.termStartDate = termStartDate ? new Date(termStartDate) : null;
    }
    if (termEndDate !== undefined) {
      settings.termEndDate = termEndDate ? new Date(termEndDate) : null;
    }
    if (currencySymbol !== undefined) {
      settings.currencySymbol = String(currencySymbol).trim() || 'KES';
    }
    if (moduleAccess !== undefined) {
      settings.moduleAccess = ensureModuleAccessDefaults(moduleAccess);
    } else if (settings.moduleAccess) {
      settings.moduleAccess = ensureModuleAccessDefaults(settings.moduleAccess);
    }
    if (universalTeacherEnabled !== undefined) {
      settings.universalTeacherEnabled = Boolean(universalTeacherEnabled);
    }
    if (schoolStartTime !== undefined) {
      settings.schoolStartTime = schoolStartTime || null;
    }
    if (schoolEndTime !== undefined) {
      settings.schoolEndTime = schoolEndTime || null;
    }
    if (breakTimes !== undefined) {
      settings.breakTimes = breakTimes || null;
    }

    settings.updatedAt = new Date();
    await settingsRepository.save(settings);

    const responseSettings = { ...settings };

    res.json({ 
      message: 'Settings updated successfully', 
      settings: responseSettings
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Get active term (for use across all pages)
export const getActiveTerm = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    if (!settings) {
      return res.json({ activeTerm: null });
    }

    res.json({ 
      activeTerm: settings.activeTerm || settings.currentTerm || null,
      currentTerm: settings.currentTerm,
      termStartDate: settings.termStartDate,
      termEndDate: settings.termEndDate
    });
  } catch (error: any) {
    console.error('Error fetching active term:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Opening day operations - make all fees due
export const processOpeningDay = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsRepository = AppDataSource.getRepository(Settings);
    
    // Get settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    if (!settings || !settings.activeTerm) {
      return res.status(400).json({ message: 'Active term not set in settings' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all pending invoices with balance > 0
    const pendingInvoices = await invoiceRepository.find({
      where: {
        status: InvoiceStatus.PENDING
      }
    });

    let updatedCount = 0;
    for (const invoice of pendingInvoices) {
      const balance = parseFloat(String(invoice.balance || 0));
      if (balance > 0) {
        // Set due date to today (opening day)
        invoice.dueDate = today;
        invoice.status = InvoiceStatus.OVERDUE; // Mark as overdue since it's due today
        await invoiceRepository.save(invoice);
        updatedCount++;
      }
    }

    res.json({ 
      message: `Opening day processed successfully. ${updatedCount} invoice(s) marked as due.`,
      updatedCount
    });
  } catch (error: any) {
    console.error('Error processing opening day:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Closing day operations - calculate closing balances
export const processClosingDay = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    
    // Get settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    if (!settings || !settings.activeTerm) {
      return res.status(400).json({ message: 'Active term not set in settings' });
    }

    if (!settings.feesSettings) {
      return res.status(400).json({ message: 'Fees settings not configured' });
    }

    // Get all active students
    const students = await studentRepository.find({
      where: { isActive: true }
    });

    const feesSettings = settings.feesSettings;
    const dayScholarTuitionFee = parseFloat(String(feesSettings.dayScholarTuitionFee || 0));
    const boarderTuitionFee = parseFloat(String(feesSettings.boarderTuitionFee || 0));
    const deskFee = parseFloat(String(feesSettings.deskFee || 0));
    const libraryFee = parseFloat(String(feesSettings.libraryFee || 0));
    const sportsFee = parseFloat(String(feesSettings.sportsFee || 0));
    const transportCost = parseFloat(String(feesSettings.transportCost || 0));
    const diningHallCost = parseFloat(String(feesSettings.diningHallCost || 0));
    const otherFees = feesSettings.otherFees || [];
    const otherFeesTotal = otherFees.reduce((sum: number, fee: any) => sum + parseFloat(String(fee.amount || 0)), 0);

    // Calculate next term
    function getNextTerm(currentTerm: string): string {
      const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
      if (!termMatch) {
        if (currentTerm.includes('1')) return currentTerm.replace(/1/g, '2');
        if (currentTerm.includes('2')) return currentTerm.replace(/2/g, '3');
        if (currentTerm.includes('3')) {
          const yearMatch = currentTerm.match(/(\d{4})/);
          if (yearMatch) {
            const nextYear = parseInt(yearMatch[1]) + 1;
            return currentTerm.replace(/\d{4}/, nextYear.toString()).replace(/3/g, '1');
          }
          return currentTerm.replace(/3/g, '1');
        }
        return currentTerm;
      }

      const termNum = parseInt(termMatch[1]);
      const year = termMatch[2] ? parseInt(termMatch[2]) : new Date().getFullYear();

      if (termNum === 1) {
        return `Term 2 ${year}`;
      } else if (termNum === 2) {
        return `Term 3 ${year}`;
      } else if (termNum === 3) {
        return `Term 1 ${year + 1}`;
      }

      return currentTerm;
    }

    const nextTerm = getNextTerm(settings.activeTerm);
    let processedCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const student of students) {
      // Get latest invoice for the student
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      // Calculate current balance and prepaid amount
      const currentBalance = parseFloat(String(latestInvoice?.balance || 0));
      const prepaidAmount = parseFloat(String(latestInvoice?.prepaidAmount || 0));

      // Calculate fees for next term based on student type and staff child status
      let nextTermFees = 0;
      
      // Staff children don't pay tuition fees
      if (!student.isStaffChild) {
        const tuitionFee = student.studentType === 'Boarder' ? boarderTuitionFee : dayScholarTuitionFee;
        nextTermFees += tuitionFee;
      }
      
      // Desk fee, library fee, sports fee, and other fees: only for non-staff children
      if (!student.isStaffChild) {
        nextTermFees += deskFee;
        nextTermFees += libraryFee;
        nextTermFees += sportsFee;
        nextTermFees += otherFeesTotal;
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

      // Apply prepaid amount to next term fees (if any)
      const appliedPrepaidAmount = Math.min(prepaidAmount, nextTermFees);
      const remainingPrepaidAmount = Math.max(0, prepaidAmount - appliedPrepaidAmount);
      
      // Closing balance = current balance + fees for next term - applied prepaid amount
      const closingBalance = currentBalance + nextTermFees - appliedPrepaidAmount;

      // Create new invoice for next term with closing balance
      const invoiceCount = await invoiceRepository.count();
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

      const newInvoice = invoiceRepository.create({
        invoiceNumber,
        studentId: student.id,
        amount: nextTermFees,
        previousBalance: currentBalance,
        prepaidAmount: remainingPrepaidAmount, // Carry forward remaining prepaid amount
        balance: closingBalance,
        dueDate: today, // Will be updated on opening day
        term: nextTerm,
        description: `Closing balance from ${settings.activeTerm} + fees for ${nextTerm}${appliedPrepaidAmount > 0 ? ` (Prepaid: ${appliedPrepaidAmount.toFixed(2)})` : ''}`,
        status: InvoiceStatus.PENDING
      });

      await invoiceRepository.save(newInvoice);
      processedCount++;
    }

    res.json({ 
      message: `Closing day processed successfully. ${processedCount} student(s) have closing balances calculated.`,
      processedCount,
      nextTerm
    });
  } catch (error: any) {
    console.error('Error processing closing day:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Get year-end reminders
export const getYearEndReminders = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    if (!settings) {
      return res.json({ 
        reminders: [],
        needsPromotion: false,
        needsFeeCalculation: false
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminders: string[] = [];
    let needsPromotion = false;
    let needsFeeCalculation = false;

    // Check if term end date is approaching or passed
    if (settings.termEndDate) {
      const termEndDate = new Date(settings.termEndDate);
      termEndDate.setHours(0, 0, 0, 0);
      
      const daysUntilEnd = Math.ceil((termEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if it's the end of academic year (Term 3)
      const isTerm3 = settings.activeTerm?.includes('Term 3') || settings.currentTerm?.includes('Term 3');
      
      if (isTerm3 && daysUntilEnd <= 7 && daysUntilEnd >= 0) {
        reminders.push(`Academic year ending soon! Class promotion should be performed after ${termEndDate.toISOString().split('T')[0]}.`);
        needsPromotion = true;
      }
      
      if (daysUntilEnd <= 3 && daysUntilEnd >= 0) {
        reminders.push(`Term ending on ${termEndDate.toISOString().split('T')[0]}. Please process closing day operations to calculate closing balances.`);
        needsFeeCalculation = true;
      }
      
      if (daysUntilEnd < 0) {
        if (isTerm3) {
          reminders.push(`⚠️ Academic year has ended! Please perform class promotion and calculate closing balances for all students.`);
          needsPromotion = true;
          needsFeeCalculation = true;
        } else {
          reminders.push(`⚠️ Term has ended! Please process closing day operations to calculate closing balances.`);
          needsFeeCalculation = true;
        }
      }
    }

    // Check if term start date is today (opening day)
    if (settings.termStartDate) {
      const termStartDate = new Date(settings.termStartDate);
      termStartDate.setHours(0, 0, 0, 0);
      
      if (termStartDate.getTime() === today.getTime()) {
        reminders.push(`📅 Today is opening day! All fees are now due. Please process opening day operations.`);
      }
    }

    res.json({ 
      reminders,
      needsPromotion,
      needsFeeCalculation,
      termStartDate: settings.termStartDate,
      termEndDate: settings.termEndDate,
      activeTerm: settings.activeTerm,
      currentTerm: settings.currentTerm
    });
  } catch (error: any) {
    console.error('Error fetching year-end reminders:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getUniformItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const items = await uniformItemRepository.find({ order: { name: 'ASC' } });
    res.json(items);
  } catch (error: any) {
    console.error('Error fetching uniform items:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const createUniformItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { name, description, unitPrice, isActive } = req.body;

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ message: 'Item name is required' });
    }

    const price = parseFloat(String(unitPrice));
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ message: 'Unit price must be a positive number' });
    }

    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const existing = await uniformItemRepository.findOne({ where: { name: String(name).trim() } });
    if (existing) {
      return res.status(400).json({ message: 'A uniform item with this name already exists' });
    }

    const item = uniformItemRepository.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      unitPrice: price,
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    const saved = await uniformItemRepository.save(item);
    res.status(201).json({ message: 'Uniform item created successfully', item: saved });
  } catch (error: any) {
    console.error('Error creating uniform item:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const updateUniformItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { name, description, unitPrice, isActive } = req.body;

    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const item = await uniformItemRepository.findOne({ where: { id } });

    if (!item) {
      return res.status(404).json({ message: 'Uniform item not found' });
    }

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'Item name cannot be empty' });
      }
      if (trimmedName !== item.name) {
        const duplicate = await uniformItemRepository.findOne({ where: { name: trimmedName } });
        if (duplicate && duplicate.id !== item.id) {
          return res.status(400).json({ message: 'Another uniform item with this name already exists' });
        }
      }
      item.name = trimmedName;
    }

    if (description !== undefined) {
      item.description = description ? String(description).trim() : null;
    }

    if (unitPrice !== undefined) {
      const price = parseFloat(String(unitPrice));
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ message: 'Unit price must be a positive number' });
      }
      item.unitPrice = price;
    }

    if (isActive !== undefined) {
      item.isActive = Boolean(isActive);
    }

    const updated = await uniformItemRepository.save(item);
    res.json({ message: 'Uniform item updated successfully', item: updated });
  } catch (error: any) {
    console.error('Error updating uniform item:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const deleteUniformItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);

    const item = await uniformItemRepository.findOne({ where: { id } });
    if (!item) {
      return res.status(404).json({ message: 'Uniform item not found' });
    }

    await uniformItemRepository.remove(item);
    res.json({ message: 'Uniform item deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting uniform item:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const resetSystemData = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot reset system data.' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can reset system data.' });
    }

    const { confirm } = req.body || {};
    if (!confirm) {
      return res.status(400).json({ message: 'Reset confirmation is required.' });
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      await manager.getRepository(InvoiceUniformItem).clear();
      await manager.getRepository(Invoice).clear();
      await manager.getRepository(Marks).clear();
      await manager.getRepository(Attendance).clear();
      await manager.getRepository(ReportCardRemarks).clear();
      await manager.getRepository(RecordBook).clear();
      await manager.getRepository(StudentTransfer).clear();
      await manager.getRepository(TimetableChangeLog).clear();
      await manager.getRepository(TimetableVersion).clear();
      await manager.getRepository(TimetableEntry).clear();
      await manager.getRepository(Timetable).clear();
      await manager.getRepository(TeacherClass).clear();
      await manager.getRepository(Message).clear();
      await manager.getRepository(ParentStudent).clear();
      await manager.getRepository(Student).clear();
      await manager.getRepository(Parent).clear();
      await manager.getRepository(UniformItem).clear();

      await manager
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('role NOT IN (:...roles)', { roles: [UserRole.ADMIN, UserRole.SUPERADMIN] })
        .execute();

      await queryRunner.commitTransaction();

      res.json({
        message: 'System data reset successfully. Admin accounts and core settings have been preserved.'
      });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error resetting system data:', error);
      res.status(500).json({
        message: 'Server error during system reset',
        error: error.message || 'Unknown error'
      });
    } finally {
      await queryRunner.release();
    }
  } catch (error: any) {
    console.error('Error in resetSystemData handler:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

