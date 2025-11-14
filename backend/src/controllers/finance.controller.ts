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

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get previous balance and prepaid amount from last invoice
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });

    // Ensure numeric values to avoid string concatenation
    const previousBalance = parseFloat(String(lastInvoice?.balance || 0));
    const prepaidAmount = parseFloat(String(lastInvoice?.prepaidAmount || 0));
    let baseAmount = parseFloat(String(amount || 0));
    let calculatedFees = 0;

    // If term is provided, automatically calculate fees for that term
    // This ensures fees are added for the selected term (tuition, transport, DH, sports, library)
    // The amount field can be used for manual adjustments, but if term is provided, we calculate fees
    if (term) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });

      if (settings && settings.feesSettings) {
        const fees = settings.feesSettings;
        const dayScholarTuitionFee = parseFloat(String(fees.dayScholarTuitionFee || 0));
        const boarderTuitionFee = parseFloat(String(fees.boarderTuitionFee || 0));
        const deskFee = parseFloat(String(fees.deskFee || 0));
        const transportCost = parseFloat(String(fees.transportCost || 0));
        const diningHallCost = parseFloat(String(fees.diningHallCost || 0));
        const libraryFee = parseFloat(String(fees.libraryFee || 0));
        const sportsFee = parseFloat(String(fees.sportsFee || 0));
        const otherFees = fees.otherFees || [];
        const otherFeesTotal = otherFees.reduce((sum: number, fee: any) => sum + parseFloat(String(fee.amount || 0)), 0);

        // Check if desk fee was already charged (only charge once at registration)
        const hasPreviousInvoice = Boolean(lastInvoice);
        const shouldChargeDeskFee = !hasPreviousInvoice;

        // Calculate fees based on staff child status
        if (!student.isStaffChild) {
          const tuitionFee = student.studentType === 'Boarder' ? boarderTuitionFee : dayScholarTuitionFee;
          calculatedFees += tuitionFee;
        }

        // Desk fee: only charged once at registration
        if (!student.isStaffChild && shouldChargeDeskFee) {
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

        const unitPrice = parseFloat(String(uniformItem.unitPrice || 0));
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

    const amountNum = baseAmount + uniformTotal;
    
    // Calculate total invoice amount (previous balance + new amount)
    const totalInvoiceAmount = previousBalance + amountNum;
    
    // Calculate how much prepaid amount is applied to this invoice
    // Prepaid amount can cover part or all of the total invoice amount
    const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
    // Remaining prepaid amount (if any) carries forward
    const remainingPrepaidAmount = Math.max(0, prepaidAmount - appliedPrepaidAmount);
    
    // Final balance = total invoice amount - applied prepaid amount
    const totalAmount = totalInvoiceAmount - appliedPrepaidAmount;

    // Generate invoice number
    const invoiceCount = await invoiceRepository.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

    const invoice = invoiceRepository.create({
      invoiceNumber,
      studentId,
      amount: amountNum,
      previousBalance,
      prepaidAmount: remainingPrepaidAmount, // Carry forward remaining prepaid amount
      balance: totalAmount,
      dueDate,
      term,
      description,
      status: InvoiceStatus.PENDING,
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
      relations: ['class']
    });

    if (studentWithClass) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });

      try {
        const invoicePDF = await createInvoicePDF({
          invoice: (invoiceWithRelations || savedInvoice),
          student: studentWithClass,
          settings
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
    const { studentId, status, invoiceId } = req.query as { studentId?: string; status?: string; invoiceId?: string };

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (invoiceId) where.id = invoiceId;

    const invoices = await invoiceRepository.find({
      where,
      relations: ['student'],
      order: { createdAt: 'DESC' }
    });

    res.json(invoices);
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
    const oldPaidAmount = parseFloat(String(invoice.paidAmount || 0));
    const oldPrepaidAmount = parseFloat(String(invoice.prepaidAmount || 0));
    const paidAmountNum = parseFloat(String(paidAmount));
    const currentBalance = parseFloat(String(invoice.balance || 0));
    
    if (isPrepayment) {
      // Handle prepayment: add to prepaid amount
      invoice.prepaidAmount = oldPrepaidAmount + paidAmountNum;
      // Prepayment also reduces the current invoice balance
      invoice.paidAmount = oldPaidAmount + paidAmountNum;
      invoice.balance = Math.max(0, currentBalance - paidAmountNum);
    } else {
      // Regular payment: only reduce current invoice balance
      invoice.paidAmount = oldPaidAmount + paidAmountNum;
      invoice.balance = Math.max(0, currentBalance - paidAmountNum);
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
      relations: ['class']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

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

    // Get current balance
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });

    const currentBalance = lastInvoice?.balance || 0;
    const nextTermBalance = currentBalance + nextTermAmount;

    res.json({
      currentBalance,
      nextTermAmount,
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

    const { 
      dayScholarTuitionFee = 0, 
      boarderTuitionFee = 0,
      transportCost = 0,
      diningHallCost = 0,
      deskFee = 0,
      libraryFee = 0,
      sportsFee = 0,
      otherFees = []
    } = settings.feesSettings;
    
    const otherFeesTotal = (otherFees || []).reduce((sum: number, fee: any) => sum + parseFloat(String(fee.amount || 0)), 0);

    // Get all active students
    const students = await studentRepository.find({
      where: { isActive: true },
      relations: ['class']
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

        // Previous balance is the outstanding fees from the last invoice
        // Ensure it's a number to avoid string concatenation
        const previousBalance = parseFloat(String(lastInvoice?.balance || 0));

        // Determine tuition fee for the NEXT term (following term)
        // The term provided is the current term, so we calculate fees for the following term
        const nextTerm = getNextTerm(term);
        
        // Desk fee is only charged once at registration
        // Get the first invoice to check if desk fee was already charged
        const shouldChargeDeskFee = !lastInvoice;
        
        // Calculate fees based on staff child status
        let termFees = 0;
        
        // Staff children don't pay tuition fees
        if (!student.isStaffChild) {
          const tuitionFeeNum = student.studentType === 'Boarder' 
            ? parseFloat(String(boarderTuitionFee || 0))
            : parseFloat(String(dayScholarTuitionFee || 0));
          
          if (tuitionFeeNum <= 0) {
            results.failed++;
            results.errors.push(`${student.firstName} ${student.lastName}: Tuition fee not set for ${student.studentType}`);
            continue;
          }
          
          termFees += tuitionFeeNum;
        }

        // Desk fee: only charged once at registration (first invoice only)
        if (!student.isStaffChild && shouldChargeDeskFee) {
          termFees += parseFloat(String(deskFee || 0));
        }
        
        // Library fee, sports fee, and other fees: charged every term for non-staff children
        if (!student.isStaffChild) {
          termFees += parseFloat(String(libraryFee || 0));
          termFees += parseFloat(String(sportsFee || 0));
          termFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport AND are not staff children
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
          termFees += parseFloat(String(transportCost || 0));
        }

        // Dining hall cost: full price for regular students, 50% for staff children
        if (student.usesDiningHall) {
          const diningCost = parseFloat(String(diningHallCost || 0));
          if (student.isStaffChild) {
            termFees += diningCost * 0.5; // 50% for staff children
          } else {
            termFees += diningCost; // Full price for regular students
          }
        }

        // Calculate total amount: Old invoice balance (outstanding fees) + Fees for following term
        // Current invoice balance = Old invoice balance + Fees for following term
        // Ensure numeric addition, not string concatenation
        const totalAmount = previousBalance + termFees;

        // Generate invoice number
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCounter).padStart(6, '0')}`;
        invoiceCounter++;

        // Create invoice for the following term
        // term variable is the current term, but we're creating invoice for next term
        const invoice = invoiceRepository.create({
          invoiceNumber,
          studentId: student.id,
          amount: termFees, // Fees for following term (ensure it's a number)
          previousBalance, // Old invoice balance (outstanding fees)
          balance: totalAmount, // Current invoice balance = Old balance + Following term fees
          dueDate: new Date(dueDate),
          term: nextTerm, // Invoice is for the following term
          description: description || `Fees for ${nextTerm} - ${student.studentType}${student.isStaffChild ? ' (Staff Child)' : ''}`,
          status: InvoiceStatus.PENDING
        });

        const savedInvoice = await invoiceRepository.save(invoice);
        
        results.created++;
        results.invoices.push({
          invoiceNumber: savedInvoice.invoiceNumber,
          studentName: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          termFees: termFees,
          previousBalance,
          totalBalance: totalAmount,
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
      relations: ['class']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const pdfBuffer = await createInvoicePDF({
      invoice,
      student,
      settings
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

export const getStudentBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.query;
    
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    // Ensure studentId is a string
    const studentIdString = typeof studentId === 'string' ? studentId : String(studentId);
    
    if (!studentIdString || studentIdString.trim() === '') {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    // Try to find student by ID (UUID) or by studentNumber
    // Check if it's a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let student;
    
    if (uuidRegex.test(studentIdString)) {
      // Search by ID (UUID)
      student = await studentRepository.findOne({
        where: { id: studentIdString },
        relations: ['class']
      });
    } else {
      // Search by studentNumber
      student = await studentRepository.findOne({
        where: { studentNumber: studentIdString },
        relations: ['class']
      });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found. Please check the Student ID or Student Number.' });
    }

    // Get the latest invoice to get current balance
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' }
    });

    const balance = lastInvoice?.balance || 0;
    const lastInvoiceAmount = parseFloat(String(lastInvoice?.amount || 0));
    const previousBalance = parseFloat(String(lastInvoice?.previousBalance || 0));
    const paidAmount = parseFloat(String(lastInvoice?.paidAmount || 0));

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.lastName} ${student.firstName}`,
      balance: balance,
      lastInvoiceId: lastInvoice?.id || null,
      lastInvoiceNumber: lastInvoice?.invoiceNumber || null,
      lastInvoiceTerm: lastInvoice?.term || null,
      lastInvoiceDate: lastInvoice?.createdAt || null,
      lastInvoiceAmount: lastInvoiceAmount,
      lastInvoicePreviousBalance: previousBalance,
      lastInvoicePaidAmount: paidAmount,
      lastInvoiceBalance: balance
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
      relations: ['class']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    const pdfBuffer = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paymentAmount ? parseFloat(paymentAmount as string) : invoice.paidAmount || 0,
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

