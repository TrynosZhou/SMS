import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { createInvoicePDF } from '../utils/invoicePdfGenerator';
import { createReceiptPDF } from '../utils/receiptPdfGenerator';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount } from '../utils/numberUtils';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';

// Helper function to determine next term
function getNextTerm(currentTerm: string): string {
  // Extract term number and year if present
  const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
  if (!termMatch) {
    // If format is not recognized, try to increment
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

export const createInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, amount, dueDate, term, description, uniformItems } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const invoiceUniformItemRepository = AppDataSource.getRepository(InvoiceUniformItem);

    // Find student and validate
    const student = await studentRepository.findOne({ 
      where: { id: studentId },
      relations: ['user']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Log student information for debugging
    console.log(`[createInvoice] Creating invoice for student: ${student.studentNumber} (ID: ${student.id}, userId: ${student.userId || 'null'})`);

    // Get previous balance and prepaid amount from last invoice
    // Query using multiple criteria to handle any reference mismatches
    const lastInvoiceQuery = invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('invoice.studentId = :studentId', { studentId })
      .orWhere('student.studentNumber = :studentNumber', { studentNumber: student.studentNumber })
      .orderBy('invoice.createdAt', 'DESC')
      .limit(1);
    
    const lastInvoice = await lastInvoiceQuery.getOne();
    
    if (lastInvoice && lastInvoice.studentId !== student.id) {
      console.warn(`[createInvoice] WARNING: Last invoice ${lastInvoice.invoiceNumber} has mismatched studentId. Expected: ${student.id}, Found: ${lastInvoice.studentId}`);
      // Fix the reference
      lastInvoice.studentId = student.id;
      await invoiceRepository.save(lastInvoice);
      console.log(`[createInvoice] Fixed invoice reference for ${lastInvoice.invoiceNumber}`);
    }

    // Ensure numeric values to avoid string concatenation
    const previousBalance = parseAmount(lastInvoice?.balance);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    let baseAmount = parseAmount(amount);
    let calculatedFees = 0;

    // If term is provided, automatically calculate fees for that term
    // This ensures fees are added for the selected term (tuition, transport, DH, sports, library)
    // The amount field can be used for manual adjustments, but if term is provided, we calculate fees
    if (term) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      if (settings && settings.feesSettings) {
        const fees = settings.feesSettings;
        const dayScholarTuitionFee = parseAmount(fees.dayScholarTuitionFee);
        const boarderTuitionFee = parseAmount(fees.boarderTuitionFee);
        const registrationFee = parseAmount(fees.registrationFee);
        const deskFee = parseAmount(fees.deskFee);
        const transportCost = parseAmount(fees.transportCost);
        const diningHallCost = parseAmount(fees.diningHallCost);
        const libraryFee = parseAmount(fees.libraryFee);
        const sportsFee = parseAmount(fees.sportsFee);
        const otherFees = Array.isArray(fees.otherFees) ? fees.otherFees : [];
        const otherFeesTotal = otherFees.reduce((sum: number, fee: any) => sum + parseAmount(fee?.amount), 0);

        // Desk fee and registration fee: charged once at registration only (not for staff children)
        const hasPreviousInvoice = Boolean(lastInvoice);
        const shouldChargeOneTimeFees = !hasPreviousInvoice;

        // Calculate fees based on staff child status
        if (!student.isStaffChild) {
          const tuitionFee = student.studentType === 'Boarder' ? boarderTuitionFee : dayScholarTuitionFee;
          calculatedFees += tuitionFee;
        }

        // Registration fee: only charged once at registration (does not apply to staff children)
        if (!student.isStaffChild && shouldChargeOneTimeFees) {
          calculatedFees += registrationFee;
        }

        // Desk fee: only charged once at registration (does not apply to staff children)
        if (!student.isStaffChild && shouldChargeOneTimeFees) {
          calculatedFees += deskFee;
        }

        // Library fee, sports fee: charged every term
        if (!student.isStaffChild) {
          calculatedFees += libraryFee;
          calculatedFees += sportsFee;
          calculatedFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
          calculatedFees += transportCost;
        }

        // Dining hall cost: full price for regular students, 50% for staff children
        if (student.usesDiningHall) {
          if (student.isStaffChild) {
            calculatedFees += diningHallCost * 0.5; // 50% for staff children
          } else {
            calculatedFees += diningHallCost; // Full price for regular students
          }
        }

        const hasUniformItems = Array.isArray(uniformItems) && uniformItems.length > 0;
        const isUniformOnlyInvoice = hasUniformItems && baseAmount === 0;

        if (calculatedFees > 0) {
          // When the user supplied a base amount, respect it (allows discounts/adjustments)
          // Otherwise, default to the calculated fees – except for uniform-only invoices where
          // accountants intentionally keep tuition at 0.
          if (!isUniformOnlyInvoice) {
            const baseAmountMatchesCalculated = Math.abs(baseAmount - calculatedFees) < 0.01;
            if (baseAmount === 0 || baseAmountMatchesCalculated) {
              baseAmount = calculatedFees;
            }
          }
        } else if (calculatedFees === 0 && baseAmount === 0 && !hasUniformItems) {
          // If no fees calculated and no amount provided and no uniform items, this is an error
          // But we'll let it pass and handle validation elsewhere
        }
      }
    }

    if (!Number.isFinite(calculatedFees)) {
      calculatedFees = 0;
    }

    // Process uniform items (check if this is a uniform-only invoice)
    let uniformTotal = 0;
    let uniformItemsEntities: InvoiceUniformItem[] = [];

    if (Array.isArray(uniformItems) && uniformItems.length > 0) {
      for (let index = 0; index < uniformItems.length; index++) {
        const payloadItem = uniformItems[index];
        const itemId = payloadItem?.itemId || payloadItem?.uniformItemId;
        const quantityRaw = payloadItem?.quantity;

        if (!itemId) {
          return res.status(400).json({ message: `Uniform item ID missing for entry at index ${index}` });
        }

        const quantity = parseInt(String(quantityRaw), 10);
        if (isNaN(quantity) || quantity <= 0) {
          return res.status(400).json({ message: `Invalid quantity for uniform item at index ${index}` });
        }

        const uniformItem = await uniformItemRepository.findOne({
          where: { id: itemId }
        });

        if (!uniformItem || !uniformItem.isActive) {
          return res.status(400).json({ message: `Uniform item not found or inactive (${itemId})` });
        }

        const unitPrice = parseAmount(uniformItem.unitPrice);
        const lineTotal = unitPrice * quantity;
        uniformTotal += lineTotal;

        uniformItemsEntities.push(
          invoiceUniformItemRepository.create({
            uniformItem,
            uniformItemId: uniformItem.id,
            itemName: uniformItem.name,
            unitPrice,
            quantity,
            lineTotal
          })
        );
      }
    }

    const amountNumRaw = baseAmount + uniformTotal;
    const amountNum = Number.isFinite(amountNumRaw) ? amountNumRaw : 0;
    
    // Calculate total invoice amount (previous balance + new amount)
    const totalInvoiceAmountRaw = previousBalance + amountNum;
    const totalInvoiceAmount = Number.isFinite(totalInvoiceAmountRaw) ? totalInvoiceAmountRaw : 0;
    
    // Calculate how much prepaid amount is applied to this invoice
    // Prepaid amount can cover part or all of the total invoice amount
    const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
    const remainingPrepaidAmount = Math.max(0, prepaidAmount - appliedPrepaidAmount);
    const finalBalance = totalInvoiceAmount - appliedPrepaidAmount;

    // Generate invoice number
    const invoiceCount = await invoiceRepository.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

    const invoice = invoiceRepository.create({
      invoiceNumber,
      studentId,
      amount: amountNum,
      previousBalance,
      paidAmount: appliedPrepaidAmount,
      prepaidAmount: remainingPrepaidAmount,
      balance: finalBalance,
      dueDate,
      term,
      description,
      status: finalBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      uniformTotal,
      uniformItems: uniformItemsEntities
    });

    const savedInvoice = await invoiceRepository.save(invoice);
    const invoiceWithRelations = await invoiceRepository.findOne({
      where: { id: savedInvoice.id },
      relations: ['student']
    });
    
    // Generate invoice PDF
    const studentWithClass = await studentRepository.findOne({ 
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (studentWithClass) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });

      try {
        // This invoice is the student's first if they had no previous invoice before we created this one
        const isFirstInvoiceForPdf = !lastInvoice;
        const invoicePDF = await createInvoicePDF({
          invoice: (invoiceWithRelations || savedInvoice),
          student: studentWithClass,
          settings,
          isFirstInvoice: isFirstInvoiceForPdf
        });

        res.status(201).json({ 
          message: 'Invoice created successfully', 
          invoice: (invoiceWithRelations || savedInvoice),
          invoicePdf: invoicePDF.toString('base64')
        });
      } catch (pdfError) {
        console.error('Error generating invoice PDF:', pdfError);
        res.status(201).json({ 
          message: 'Invoice created successfully (PDF generation failed)', 
          invoice: (invoiceWithRelations || savedInvoice)
        });
      }
    } else {
      res.status(201).json({ message: 'Invoice created successfully', invoice: (invoiceWithRelations || savedInvoice) });
    }
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const {
      studentId,
      status,
      invoiceId,
      page: pageParam,
      limit: limitParam
    } = req.query as { studentId?: string; status?: string; invoiceId?: string; page?: string; limit?: string };

    const { page, limit, skip } = resolvePaginationParams(pageParam, limitParam);

    const queryBuilder = invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .orderBy('invoice.createdAt', 'DESC');

    if (studentId) {
      // Query by studentId, but also handle cases where studentId might be a studentNumber
      // First check if it's a UUID (studentId) or a studentNumber
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(studentId)) {
        // It's a UUID, query directly
        queryBuilder.andWhere('invoice.studentId = :studentId', { studentId });
      } else {
        // It might be a studentNumber, query through the join
        queryBuilder.andWhere(
          '(invoice.studentId = :studentId OR student.studentNumber = :studentNumber)',
          { studentId, studentNumber: studentId }
        );
      }
    }
    if (status) {
      queryBuilder.andWhere('invoice.status = :status', { status });
    }
    if (invoiceId) {
      queryBuilder.andWhere('invoice.id = :invoiceId', { invoiceId });
    }

    const [invoices, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    res.json(buildPaginationResponse(invoices, total, page, limit));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateInvoicePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paidAmount, paymentDate, paymentMethod, notes, isPrepayment } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    if (!paidAmount || paidAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount is required and must be greater than 0' });
    }

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student']
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Ensure all values are numbers to avoid string concatenation
    const oldPaidAmount = parseAmount(invoice.paidAmount);
    const oldPrepaidAmount = parseAmount(invoice.prepaidAmount);
    const paidAmountNum = parseAmount(paidAmount);
    const currentBalance = parseAmount(invoice.balance);
    
    if (isPrepayment) {
      invoice.prepaidAmount = oldPrepaidAmount + paidAmountNum;
      invoice.paidAmount = oldPaidAmount + paidAmountNum;
    } else {
      const paymentTowardBalance = Math.min(paidAmountNum, currentBalance);
      const overPayment = Math.max(0, paidAmountNum - paymentTowardBalance);

      invoice.paidAmount = oldPaidAmount + paymentTowardBalance;
      invoice.balance = Math.max(0, currentBalance - paymentTowardBalance);

      if (overPayment > 0) {
        invoice.prepaidAmount = oldPrepaidAmount + overPayment;
      }
    }

    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.paidAmount > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    }

    // Check if overdue
    if (new Date() > invoice.dueDate && invoice.balance > 0) {
      invoice.status = InvoiceStatus.OVERDUE;
    }

    await invoiceRepository.save(invoice);

    // Generate receipt PDF
    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    // Use provided payment date or current date
    const actualPaymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const receiptPDF = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paidAmount,
      paymentDate: actualPaymentDate,
      paymentMethod: paymentMethod || 'Cash',
      notes: notes || '',
      receiptNumber,
      isPrepayment: isPrepayment || false
    });

    res.json({ 
      message: 'Payment updated successfully', 
      invoice,
      receiptPdf: receiptPDF.toString('base64'),
      receiptNumber
    });
  } catch (error: any) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const calculateNextTermBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, nextTermAmount } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get current balance
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });

    const currentBalance = parseAmount(lastInvoice?.balance);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    const totalBeforeCredit = currentBalance + nextTermAmount;
    const appliedPrepaid = Math.min(prepaidAmount, totalBeforeCredit);
    const nextTermBalance = totalBeforeCredit - appliedPrepaid;

    res.json({
      currentBalance,
      nextTermAmount,
      appliedPrepaid,
      availablePrepaid: prepaidAmount,
      nextTermBalance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const createBulkInvoices = async (req: AuthRequest, res: Response) => {
  try {
    // term is the CURRENT term - invoices will be created for the FOLLOWING term
    const { term, dueDate, description } = req.body;
    
    if (!term || !dueDate) {
      return res.status(400).json({ message: 'Current term and due date are required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get settings for tuition fees
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    if (!settings || !settings.feesSettings) {
      return res.status(400).json({ message: 'Fee settings not configured. Please configure fees in settings first.' });
    }

    const feesConfig = settings.feesSettings;
    const dayScholarTuitionFee = parseAmount(feesConfig.dayScholarTuitionFee);
    const boarderTuitionFee = parseAmount(feesConfig.boarderTuitionFee);
    const registrationFee = parseAmount(feesConfig.registrationFee);
    const transportCost = parseAmount(feesConfig.transportCost);
    const diningHallCost = parseAmount(feesConfig.diningHallCost);
    const deskFee = parseAmount(feesConfig.deskFee);
    const libraryFee = parseAmount(feesConfig.libraryFee);
    const sportsFee = parseAmount(feesConfig.sportsFee);
    const otherFeesArray = Array.isArray(feesConfig.otherFees) ? feesConfig.otherFees : [];
    const otherFeesTotal = otherFeesArray.reduce((sum: number, fee: any) => sum + parseAmount(fee?.amount), 0);

    // Get all active students
    const students = await studentRepository.find({
      where: { isActive: true },
      relations: ['classEntity']
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No active students found' });
    }

    const results = {
      total: students.length,
      created: 0,
      failed: 0,
      invoices: [] as any[],
      errors: [] as string[]
    };

    // Get current invoice count for numbering
    const invoiceCount = await invoiceRepository.count();
    let invoiceCounter = invoiceCount + 1;

    // Process each student
    for (const student of students) {
      try {
        // Get previous balance from last invoice (this is the outstanding fees balance)
        const lastInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id },
          order: { createdAt: 'DESC' }
        });

        // Previous balance and prepaid credit from the last invoice
        const previousBalance = parseAmount(lastInvoice?.balance);
        const previousPrepaid = parseAmount(lastInvoice?.prepaidAmount);

        // Determine tuition fee for the NEXT term (following term)
        // The term provided is the current term, so we calculate fees for the following term
        const nextTerm = getNextTerm(term);
        
        // Desk fee and registration fee: only charged once at registration (first invoice only; does not apply to staff children)
        const shouldChargeOneTimeFees = !lastInvoice;
        
        // Calculate fees based on staff child status
        let termFees = 0;
        
        // Staff children don't pay tuition fees
        if (!student.isStaffChild) {
          const tuitionFeeNum = student.studentType === 'Boarder' 
            ? boarderTuitionFee
            : dayScholarTuitionFee;
          
          if (tuitionFeeNum <= 0) {
            results.failed++;
            results.errors.push(`${student.firstName} ${student.lastName}: Tuition fee not set for ${student.studentType}`);
            continue;
          }
          
          termFees += tuitionFeeNum;
        }

        // Registration fee: only charged once at registration (first invoice only)
        if (!student.isStaffChild && shouldChargeOneTimeFees) {
          termFees += registrationFee;
        }

        // Desk fee: only charged once at registration (first invoice only)
        if (!student.isStaffChild && shouldChargeOneTimeFees) {
          termFees += deskFee;
        }
        
        // Library fee, sports fee, and other fees: charged every term for non-staff children
        if (!student.isStaffChild) {
          termFees += libraryFee;
          termFees += sportsFee;
          termFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport AND are not staff children
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
          termFees += transportCost;
        }

        // Dining hall cost: full price for regular students, 50% for staff children
        if (student.usesDiningHall) {
          const diningCost = diningHallCost;
          if (student.isStaffChild) {
            termFees += diningCost * 0.5; // 50% for staff children
          } else {
            termFees += diningCost; // Full price for regular students
          }
        }

        if (!Number.isFinite(termFees)) {
          termFees = 0;
        }

        // Calculate total amount due for the new invoice (before applying prepaid credit)
        const totalAmount = previousBalance + termFees;
        const appliedPrepaid = Math.min(previousPrepaid, totalAmount);
        const remainingPrepaid = previousPrepaid - appliedPrepaid;
        const finalBalance = totalAmount - appliedPrepaid;

        // Generate invoice number
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCounter).padStart(6, '0')}`;
        invoiceCounter++;

        // Create invoice for the following term
        // term variable is the current term, but we're creating invoice for next term
        const invoice = invoiceRepository.create({
          invoiceNumber,
          studentId: student.id,
          amount: termFees,
          previousBalance,
          balance: finalBalance,
          prepaidAmount: remainingPrepaid,
          paidAmount: appliedPrepaid,
          dueDate: new Date(dueDate),
          term: nextTerm,
          description: description || `Fees for ${nextTerm} - ${student.studentType}${student.isStaffChild ? ' (Staff Child)' : ''}`,
          status: finalBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING
        });

        const savedInvoice = await invoiceRepository.save(invoice);
        
        results.created++;
        results.invoices.push({
          invoiceNumber: savedInvoice.invoiceNumber,
          studentName: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          termFees: termFees,
          previousBalance,
          totalBalance: finalBalance,
          prepaidApplied: appliedPrepaid,
          remainingPrepaid,
          term: nextTerm
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${student.firstName} ${student.lastName}: ${error.message || 'Unknown error'}`);
        console.error(`Error creating invoice for student ${student.id}:`, error);
      }
    }

    res.status(201).json({
      message: `Bulk invoice creation completed. Created: ${results.created}, Failed: ${results.failed}`,
      summary: results
    });
  } catch (error: any) {
    console.error('Error in bulk invoice creation:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateInvoicePDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student']
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Only show registration/desk fee on the student's first invoice (charged once at registration)
    const firstInvoiceForStudent = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'ASC' },
      select: ['id']
    });
    const isFirstInvoice = firstInvoiceForStudent?.id === invoice.id;

    const pdfBuffer = await createInvoicePDF({
      invoice,
      student,
      settings,
      isFirstInvoice
    });

    // Create filename with student's full name
    const firstName = (student.firstName || '').trim();
    const lastName = (student.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    
    // Sanitize filename: keep letters, numbers, spaces, and hyphens only
    let sanitizedName = fullName
      .replace(/[^a-zA-Z0-9\s\-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens for filename compatibility
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .trim();
    
    // If sanitization removed everything, use a fallback
    if (!sanitizedName || sanitizedName.length === 0) {
      sanitizedName = `Student-${student.studentNumber || 'Invoice'}`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedName}-${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getOutstandingBalances = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    // Get all students
    const allStudents = await studentRepository.find({
      order: { studentNumber: 'ASC' }
    });

    // Get latest invoice for each student in a single query
    const outstandingBalances = [];

    for (const student of allStudents) {
      // Get the latest invoice for this student
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      if (latestInvoice) {
        const balance = parseAmount(latestInvoice.balance);
        
        // Only include students with balance > 0
        if (balance > 0) {
          outstandingBalances.push({
            studentId: student.id,
            studentNumber: student.studentNumber,
            firstName: student.firstName,
            lastName: student.lastName,
            phoneNumber: student.phoneNumber || '',
            invoiceBalance: balance
          });
        }
      }
    }

    res.json(outstandingBalances);
  } catch (error: any) {
    console.error('Error fetching outstanding balances:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getStudentBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.query;
    
    console.log(`[getStudentBalance] Request received with studentId: ${studentId} (type: ${typeof studentId})`);
    
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    // Ensure studentId is a string
    const studentIdString = typeof studentId === 'string' ? studentId : String(studentId);
    const trimmedStudentId = studentIdString.trim();
    
    console.log(`[getStudentBalance] Processing studentId: "${trimmedStudentId}"`);
    
    if (!trimmedStudentId || trimmedStudentId === '') {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    // Try to find student by ID (UUID) or by studentNumber
    // Check if it's a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let student;
    
    if (uuidRegex.test(trimmedStudentId)) {
      // Search by ID (UUID)
      console.log(`[getStudentBalance] Searching by UUID: ${trimmedStudentId}`);
      student = await studentRepository.findOne({
        where: { id: trimmedStudentId },
        relations: ['classEntity']
      });
    } else {
      // Search by studentNumber (case-insensitive)
      console.log(`[getStudentBalance] Searching by studentNumber: ${trimmedStudentId}`);
      student = await studentRepository
        .createQueryBuilder('student')
        .where('LOWER(student.studentNumber) = LOWER(:studentNumber)', { studentNumber: trimmedStudentId })
        .leftJoinAndSelect('student.classEntity', 'classEntity')
        .getOne();
    }

    if (!student) {
      console.log(`[getStudentBalance] Student not found for: ${trimmedStudentId}`);
      return res.status(404).json({ message: 'Student not found. Please check the Student ID or Student Number.' });
    }
    
    console.log(`[getStudentBalance] Student found: ${student.studentNumber} (ID: ${student.id}, userId: ${student.userId || 'null'})`);

    // Query invoices using multiple criteria to handle reference mismatches
    // First, try direct match by studentId (most common case)
    // Then, also check for invoices that might be linked via studentNumber through the join
    const invoiceQueryBuilder = invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('invoice.studentId = :studentId', { studentId: student.id })
      .orWhere('student.studentNumber = :studentNumber', { studentNumber: student.studentNumber })
      .orderBy('invoice.createdAt', 'DESC');

    // Get the latest invoice - it should contain the cumulative balance
    // In this system, each new invoice carries forward the previous balance,
    // so the latest invoice's balance represents the total outstanding amount
    const lastInvoice = await invoiceQueryBuilder
      .limit(1)
      .getOne();

    // Get all invoices to check for any discrepancies
    // Filter to ensure we only get invoices for this specific student
    const allInvoicesRaw = await invoiceQueryBuilder.getMany();
    const allInvoices = allInvoicesRaw.filter(inv => 
      inv.studentId === student.id || 
      (inv.student && inv.student.studentNumber === student.studentNumber)
    );

    let currentBalance = 0;
    let totalPrepaidAmount = 0;
    
    console.log(`[getStudentBalance] Found ${allInvoices.length} invoice(s) for student ${student.studentNumber} (${student.id})`);
    
    if (!lastInvoice) {
      // No invoices, balance is 0
      currentBalance = 0;
      console.log(`[getStudentBalance] No invoices found, balance = 0`);
    } else {
      // Use the latest invoice's balance as the source of truth
      // The latest invoice should have the cumulative balance including all previous balances
      currentBalance = parseAmount(lastInvoice.balance);
      totalPrepaidAmount = parseAmount(lastInvoice.prepaidAmount);
      
      console.log(`[getStudentBalance] Latest invoice ${lastInvoice.invoiceNumber}: balance=${currentBalance}, previousBalance=${parseAmount(lastInvoice.previousBalance)}, amount=${parseAmount(lastInvoice.amount)}`);
      
      // Log all invoices for debugging
      for (const invoice of allInvoices) {
        const invBalance = parseAmount(invoice.balance);
        const invPrevBalance = parseAmount(invoice.previousBalance);
        console.log(`[getStudentBalance] Invoice ${invoice.invoiceNumber} (${invoice.term}): balance=${invBalance}, previousBalance=${invPrevBalance}, amount=${parseAmount(invoice.amount)}`);
      }
    }

    const lastInvoiceAmount = parseAmount(lastInvoice?.amount);
    const previousBalance = parseAmount(lastInvoice?.previousBalance);
    const paidAmount = parseAmount(lastInvoice?.paidAmount);
    const lastInvoiceBalance = parseAmount(lastInvoice?.balance);

    console.log(`[getStudentBalance] Final balance for student ${student.studentNumber}: ${currentBalance}`);

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.lastName} ${student.firstName}`,
      balance: currentBalance, // Use latest invoice's balance (should be cumulative)
      prepaidAmount: totalPrepaidAmount,
      lastInvoiceId: lastInvoice?.id || null,
      lastInvoiceNumber: lastInvoice?.invoiceNumber || null,
      lastInvoiceTerm: lastInvoice?.term || null,
      lastInvoiceDate: lastInvoice?.createdAt || null,
      lastInvoiceAmount: lastInvoiceAmount,
      lastInvoicePreviousBalance: previousBalance,
      lastInvoicePaidAmount: paidAmount,
      lastInvoiceBalance: lastInvoiceBalance
    });
  } catch (error: any) {
    console.error('Error getting student balance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateReceiptPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentAmount, paymentDate } = req.query;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student']
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    const pdfBuffer = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paymentAmount ? parseAmount(paymentAmount) : parseAmount(invoice.paidAmount),
      paymentDate: paymentDate ? new Date(paymentDate as string) : new Date(),
      receiptNumber
    });

    const sanitizedName = `${student.lastName || 'student'}-${student.firstName || ''}`
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-]/g, '')
      .toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${sanitizedName ? sanitizedName : 'receipt'}-${receiptNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating receipt PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

