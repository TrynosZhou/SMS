import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { createInvoicePDF } from '../utils/invoicePdfGenerator';
import { createReceiptPDF } from '../utils/receiptPdfGenerator';
import { createOutstandingBalancePDF } from '../utils/outstandingBalancePdfGenerator';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount } from '../utils/numberUtils';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';
import { UserRole } from '../entities/User';
import { PaymentLog } from '../entities/PaymentLog';

const normalizePaymentMethod = (raw?: string): string | null => {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return 'CASH(USD)';
  if (val.includes('ecocash')) return 'ECOCASH(USD)';
  if (val.includes('bank') || val.includes('transfer')) return 'BANK TRANSFER(USD)';
  if (val.includes('cash')) return 'CASH(USD)';
  if (val === 'cash(usd)') return 'CASH(USD)';
  if (val === 'ecocash(usd)') return 'ECOCASH(USD)';
  if (val === 'bank transfer(usd)') return 'BANK TRANSFER(USD)';
  return null;
};
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
    const { studentId, amount, dueDate, term, description, uniformItems, tuitionAmount, diningHallAmount, otherAmount } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const invoiceUniformItemRepository = AppDataSource.getRepository(InvoiceUniformItem);

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }
    if (!dueDate) {
      return res.status(400).json({ message: 'Due date is required' });
    }
    if (!term) {
      return res.status(400).json({ message: 'Term is required' });
    }

    // Find student and validate
    const student = await studentRepository.findOne({ 
      where: { id: studentId },
      relations: ['user']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Log student information for debugging
    console.log(`[createInvoice] Creating invoice for student: ${student.studentNumber} (ID: ${student.id}, userId: ${student.userId || 'null'})`);

    // Duplicate billing guard moved below after fee components are computed

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

    const previousBalance = parseAmount(lastInvoice?.balance);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    let baseAmount = parseAmount(amount);
    let transportIncrement = 0;
    let registrationIncrement = 0;
    let deskIncrement = 0;

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    if (settings && settings.feesSettings) {
      const fees = settings.feesSettings;
      const transportCost = parseAmount(fees.transportCost);
      const registrationFee = parseAmount(fees.registrationFee);
      const deskFee = parseAmount(fees.deskFee);

      if (
        student.studentType === 'Day Scholar' &&
        student.usesTransport &&
        !student.isStaffChild &&
        Number.isFinite(transportCost) &&
        transportCost > 0
      ) {
        transportIncrement = transportCost;
      }

      const hasPreviousInvoice = !!lastInvoice;
      const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
      const isNewStudent = normalizedStatus === 'new';
      if (!student.isStaffChild && !hasPreviousInvoice && isNewStudent) {
        if (Number.isFinite(registrationFee) && registrationFee > 0) {
          registrationIncrement = registrationFee;
        }
        if (Number.isFinite(deskFee) && deskFee > 0) {
          deskIncrement = deskFee;
        }
      }
    }

    if (!Number.isFinite(baseAmount)) {
      baseAmount = 0;
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

    const amountNumRaw = baseAmount + transportIncrement + registrationIncrement + deskIncrement + uniformTotal;
    const amountNum = Number.isFinite(amountNumRaw) ? amountNumRaw : 0;
    
    // Calculate total invoice amount (previous balance + new amount)
    const totalInvoiceAmountRaw = previousBalance + amountNum;
    const totalInvoiceAmount = Number.isFinite(totalInvoiceAmountRaw) ? totalInvoiceAmountRaw : 0;
    
    // Calculate how much prepaid amount is applied to this invoice
    // Prepaid amount can cover part or all of the total invoice amount
    const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
    const remainingPrepaidAmount = Math.max(0, prepaidAmount - appliedPrepaidAmount);
    const finalBalance = totalInvoiceAmount - appliedPrepaidAmount;

    // Generate invoice number based on the highest existing sequence for the current year
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

    let finalDescription = description;
    const tuitionVal = parseAmount(tuitionAmount);
    const diningVal = parseAmount(diningHallAmount);
    const otherVal = parseAmount(otherAmount);
    const registrationVal = registrationIncrement;
    const deskVal = deskIncrement;
    const transportVal = transportIncrement;

    // Prevent duplicate term fees but allow uniform-only invoices in same term
    const isTermFeeInvoice = (tuitionVal > 0) || (diningVal > 0) || (transportVal > 0);
    const existingTermInvoice = await invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.student', 'student')
      .where('(invoice.studentId = :studentId OR student.studentNumber = :studentNumber)', { studentId, studentNumber: student.studentNumber })
      .andWhere('invoice.term = :term', { term })
      .getOne();
    if (existingTermInvoice && isTermFeeInvoice) {
      return res.status(400).json({ message: 'Duplicate term fees are not allowed. An invoice for this term already exists for this student.' });
    }
    const breakdownParts: string[] = [];
    if (tuitionVal > 0) breakdownParts.push(`Tuition: ${tuitionVal.toFixed(2)}`);
    if (diningVal > 0) breakdownParts.push(`Dining Hall: ${diningVal.toFixed(2)}`);
    if (otherVal > 0) breakdownParts.push(`Other Charges: ${otherVal.toFixed(2)}`);
    if (registrationVal > 0) breakdownParts.push(`Registration Fee: ${registrationVal.toFixed(2)}`);
    if (deskVal > 0) breakdownParts.push(`Desk Fee: ${deskVal.toFixed(2)}`);
    if (transportVal > 0) breakdownParts.push(`Transport: ${transportVal.toFixed(2)}`);
    if (breakdownParts.length > 0) {
      const breakdownText = `Breakdown → ${breakdownParts.join(' | ')}`;
      finalDescription = finalDescription
        ? `${finalDescription}\n${breakdownText}`
        : breakdownText;
    }

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
      description: finalDescription,
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

    if (error.code === '23502') {
      return res.status(400).json({ message: 'Required invoice fields are missing or invalid' });
    }
    if (error.code === '23503') {
      return res.status(400).json({ message: 'Invalid student reference for invoice' });
    }
    if (error.code === '22P02') {
      return res.status(400).json({ message: 'Invalid data format for invoice (check amount and dates)' });
    }

    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const reverseInvoicePrepayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body as { amount?: number; notes?: string };

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const logRepo = AppDataSource.getRepository(PaymentLog);

    const invoice = await invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const oldPrepaid = Math.max(0, parseFloat(parseAmount(invoice.prepaidAmount).toFixed(2)));
    const oldPaid = Math.max(0, parseFloat(parseAmount(invoice.paidAmount).toFixed(2)));
    const reversalReq = Math.max(0, parseFloat(parseAmount(amount).toFixed(2)));

    if (!reversalReq || reversalReq <= 0) {
      return res.status(400).json({ message: 'Reversal amount is required and must be greater than 0' });
    }
    if (oldPrepaid <= 0) {
      return res.status(400).json({ message: 'No prepaid credit available to reverse for this invoice' });
    }

    const reversalAmount = Math.min(oldPrepaid, reversalReq);
    const newPrepaid = Math.max(0, parseFloat((oldPrepaid - reversalAmount).toFixed(2)));
    const newPaid = Math.max(0, parseFloat((oldPaid - reversalAmount).toFixed(2)));

    const invAmount = Math.max(0, parseFloat(parseAmount(invoice.amount).toFixed(2)));
    const invPrev = Math.max(0, parseFloat(parseAmount(invoice.previousBalance).toFixed(2)));
    const newBalance = Math.max(0, parseFloat((invAmount + invPrev - newPaid - newPrepaid).toFixed(2)));

    invoice.prepaidAmount = newPrepaid;
    invoice.paidAmount = newPaid;
    invoice.balance = newBalance;
    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.paidAmount > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    } else {
      invoice.status = InvoiceStatus.PENDING;
    }

    await invoiceRepository.save(invoice);

    const payer = req.user;
    const payerName = payer ? `${payer.firstName || ''} ${payer.lastName || ''}`.trim() : null;
    const memo = String(notes || '').trim();
    const logNotes = memo
      ? `PREPAID REVERSAL: ${memo}`
      : 'PREPAID REVERSAL';

    const reversalLog = logRepo.create({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      amountPaid: -reversalAmount,
      paymentDate: new Date(),
      paymentMethod: 'ADJUSTMENT',
      receiptNumber: null,
      payerUserId: payer?.id || null,
      payerName: payerName || null,
      notes: logNotes
    });
    await logRepo.save(reversalLog);

    res.json({
      message: 'Prepayment reversed successfully',
      invoice,
      reversedAmount: reversalAmount,
      paymentLogId: reversalLog.id
    });
  } catch (error: any) {
    console.error('Error reversing prepayment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const deletePaymentLog = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const repo = AppDataSource.getRepository(PaymentLog);
    const log = await repo.findOne({ where: { id } });
    if (!log) {
      return res.status(404).json({ message: 'Payment log not found' });
    }

    const methodTxt = String(log.paymentMethod || '').trim().toLowerCase();
    const notesTxt = String(log.notes || '').trim().toLowerCase();

    if (methodTxt === 'adjustment') {
      return res.status(400).json({ message: 'This payment entry cannot be deleted. Use adjustment workflows only.' });
    }

    if (notesTxt.includes('desk fee') || notesTxt.includes('status correction') || notesTxt.includes('reversal')) {
      return res.status(400).json({ message: 'This payment entry cannot be deleted (protected fee item).' });
    }

    await repo.remove(log);
    res.json({ message: 'Payment log deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting payment log:', error);
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

    // Compute total outstanding balance across all matching invoices (ignoring pagination)
    const sumQuery = invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.balance), 0)', 'totalBalance');

    if (studentId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(studentId)) {
        sumQuery.andWhere('invoice.studentId = :studentId', { studentId });
      } else {
        sumQuery.andWhere('invoice.studentId = :studentId', { studentId });
      }
    }
    if (status) {
      sumQuery.andWhere('invoice.status = :status', { status });
    }
    if (invoiceId) {
      sumQuery.andWhere('invoice.id = :invoiceId', { invoiceId });
    }

    const sumRaw = await sumQuery.getRawOne();
    const totalBalance = Number(sumRaw?.totalBalance ?? 0);

    res.json(
      buildPaginationResponse(invoices, total, page, limit, {
        totalBalance
      })
    );
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

    const normalizedMethod = normalizePaymentMethod(paymentMethod);
    if (normalizedMethod === null) {
      return res.status(400).json({ message: 'Invalid payment method. Allowed: CASH(USD), ECOCASH(USD), BANK TRANSFER(USD)' });
    }

    const receiptPDF = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paidAmount,
      paymentDate: actualPaymentDate,
      paymentMethod: normalizedMethod,
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

    try {
      const payer = req.user;
      const payerName = payer ? `${payer.firstName || ''} ${payer.lastName || ''}`.trim() : null;
      const logRepo = AppDataSource.getRepository(PaymentLog);
      const log = logRepo.create({
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amountPaid: parseAmount(paidAmount),
        paymentDate: actualPaymentDate,
        paymentMethod: normalizedMethod,
        receiptNumber,
        payerUserId: payer?.id || null,
        payerName: payerName || null,
        notes: notes || null
      });
      await logRepo.save(log);
    } catch (e) {
      console.error('Failed to record payment log:', e);
    }
  } catch (error: any) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const adjustInvoiceLogistics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { addTransport, addDiningHall, addTuition, diningHallAmount } = req.body;

    if (!addTransport && !addDiningHall && !addTuition) {
      return res.status(400).json({ message: 'Please select Transport, Dining Hall, and/or Tuition to add' });
    }

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

    const student = invoice.student || (await studentRepository.findOne({ where: { id: invoice.studentId } }));

    if (!student) {
      return res.status(404).json({ message: 'Student not found for this invoice' });
    }

    const isStaffOrExempted = !!student.isStaffChild || !!student.isExempted;

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    if (!settings || !settings.feesSettings) {
      return res.status(400).json({ message: 'Fee settings not configured. Configure fees in Settings first.' });
    }

    const fees = settings.feesSettings;

    let transportAmountToAdd = 0;
    if (addTransport) {
      if (student.studentType !== 'Day Scholar') {
        return res.status(400).json({ message: 'Transport cost can only be added for Day Scholar students' });
      }
      if (isStaffOrExempted) {
        return res.status(400).json({ message: 'Transport cost cannot be added for staff children or exempted students' });
      }
      const transportCost = parseAmount(fees.transportCost);
      if (!Number.isFinite(transportCost) || transportCost <= 0) {
        return res.status(400).json({ message: 'Transport cost is not configured in Settings' });
      }
      transportAmountToAdd = transportCost;
    }

    let diningHallAmountToAdd = 0;
    if (addDiningHall) {
      const diningHallCost = parseAmount(fees.diningHallCost);
      if (!Number.isFinite(diningHallCost) || diningHallCost <= 0) {
        return res.status(400).json({ message: 'Dining Hall cost is not configured in Settings' });
      }
      if (isStaffOrExempted) {
        diningHallAmountToAdd = diningHallCost * 0.5;
      } else {
        const dhAmount = parseAmount(diningHallAmount);
        if (!Number.isFinite(dhAmount) || dhAmount <= 0) {
          return res.status(400).json({ message: 'Dining Hall amount must be greater than 0' });
        }
        diningHallAmountToAdd = dhAmount;
      }
    }

    let tuitionAmountToAdd = 0;
    if (addTuition) {
      if (isStaffOrExempted) {
        return res.status(400).json({ message: 'Tuition cannot be added for staff children or exempted students' });
      }
      const dayScholarTuitionFee = parseAmount(fees.dayScholarTuitionFee);
      const boarderTuitionFee = parseAmount(fees.boarderTuitionFee);
      
      if (student.studentType === 'Boarder') {
        if (!Number.isFinite(boarderTuitionFee) || boarderTuitionFee <= 0) {
          return res.status(400).json({ message: 'Boarder tuition fee is not configured in Settings' });
        }
        tuitionAmountToAdd = boarderTuitionFee;
      } else {
        if (!Number.isFinite(dayScholarTuitionFee) || dayScholarTuitionFee <= 0) {
          return res.status(400).json({ message: 'Day Scholar tuition fee is not configured in Settings' });
        }
        tuitionAmountToAdd = dayScholarTuitionFee;
      }
    }

    const increment = transportAmountToAdd + diningHallAmountToAdd + tuitionAmountToAdd;
    if (!Number.isFinite(increment) || increment <= 0) {
      return res.status(400).json({ message: 'No valid fee amount to add' });
    }

    const currentAmount = parseAmount(invoice.amount);
    const currentBalance = parseAmount(invoice.balance);

    invoice.amount = currentAmount + increment;
    invoice.balance = currentBalance + increment;

    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.paidAmount && parseAmount(invoice.paidAmount) > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    } else {
      invoice.status = InvoiceStatus.PENDING;
    }

    if (new Date() > invoice.dueDate && invoice.balance > 0) {
      invoice.status = InvoiceStatus.OVERDUE;
    }

    const adjustments: string[] = [];
    if (transportAmountToAdd > 0) {
      adjustments.push(`Transport: ${transportAmountToAdd.toFixed(2)}`);
      if (!student.usesTransport) {
        student.usesTransport = true;
      }
    }
    if (diningHallAmountToAdd > 0) {
      adjustments.push(`Dining Hall: ${diningHallAmountToAdd.toFixed(2)}`);
      if (!student.usesDiningHall) {
        student.usesDiningHall = true;
      }
    }
    if (tuitionAmountToAdd > 0) {
      adjustments.push(`Tuition (${student.studentType}): ${tuitionAmountToAdd.toFixed(2)}`);
    }

    if (adjustments.length > 0) {
      const adjustmentText = `Adjusted fees (${adjustments.join(', ')})`;
      if (invoice.description && String(invoice.description).trim() !== '') {
        invoice.description = `${invoice.description} | ${adjustmentText}`;
      } else {
        invoice.description = adjustmentText;
      }
    }

    await studentRepository.save(student);
    const savedInvoice = await invoiceRepository.save(invoice);

    res.json({
      message: 'Invoice adjusted successfully',
      invoice: savedInvoice
    });
  } catch (error: any) {
    console.error('Error adjusting invoice logistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const applyInvoiceNote = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, item, amount } = req.body;

    if (!type || (type !== 'credit' && type !== 'debit')) {
      return res.status(400).json({ message: 'Invalid note type. Must be credit or debit.' });
    }
    if (!item || !['tuition', 'transport', 'diningHall'].includes(item)) {
      return res.status(400).json({ message: 'Invalid cost item. Must be tuition, transport, or diningHall.' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount is required and must be greater than 0' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);

    const invoice = await invoiceRepository.findOne({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const currentAmount = parseAmount(invoice.amount);
    const currentBalance = parseAmount(invoice.balance);
    const delta = type === 'credit' ? -parseAmount(amount) : parseAmount(amount);

    const newAmount = currentAmount + delta;
    const newBalance = currentBalance + delta;

    invoice.amount = newAmount;
    invoice.balance = newBalance;

    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.paidAmount && parseAmount(invoice.paidAmount) > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    } else {
      invoice.status = InvoiceStatus.PENDING;
    }

    if (new Date() > invoice.dueDate && invoice.balance > 0) {
      invoice.status = InvoiceStatus.OVERDUE;
    }

    const itemLabel =
      item === 'tuition'
        ? 'Tuition'
        : item === 'transport'
        ? 'Transport Fee'
        : 'Dining Hall Fee';

    const signedAmount = parseAmount(amount).toFixed(2);
    const noteText =
      type === 'credit'
        ? `Credit Note (${itemLabel} -${signedAmount})`
        : `Debit Note (${itemLabel} +${signedAmount})`;

    if (invoice.description && String(invoice.description).trim() !== '') {
      invoice.description = `${invoice.description} | ${noteText}`;
    } else {
      invoice.description = noteText;
    }

    const savedInvoice = await invoiceRepository.save(invoice);

    res.json({
      message: type === 'credit' ? 'Credit Note applied successfully' : 'Debit Note applied successfully',
      invoice: savedInvoice
    });
  } catch (error: any) {
    console.error('Error applying invoice note:', error);
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
        
        // Prevent duplicate invoice in the following term
        const existingNextTermInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id, term: nextTerm }
        });
        if (existingNextTermInvoice) {
          results.failed++;
          results.errors.push(`${student.firstName} ${student.lastName}: Invoice for ${nextTerm} already exists`);
          continue;
        }
        
        // Desk fee and registration fee: only charged once at registration (first invoice only; does not apply to staff children)
        const shouldChargeOneTimeFees = !lastInvoice;
        
        // Calculate fees based on staff child/exempted status
        let termFees = 0;
        
        // Staff children and exempted students don't pay tuition fees
        if (!student.isStaffChild && !student.isExempted) {
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
        if (!student.isStaffChild && !student.isExempted && shouldChargeOneTimeFees) {
          termFees += registrationFee;
        }

        // Desk fee: only charged once at registration (first invoice only)
        if (!student.isStaffChild && !student.isExempted && shouldChargeOneTimeFees) {
          termFees += deskFee;
        }
        
        // Library fee, sports fee, and other fees: charged every term for non-staff/exempted
        if (!student.isStaffChild && !student.isExempted) {
          termFees += libraryFee;
          termFees += sportsFee;
          termFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport AND are not staff children or exempted
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild && !student.isExempted) {
          termFees += transportCost;
        }

        // Dining hall cost: full price for regular students, 50% for staff children or exempted
        if (student.usesDiningHall) {
          const diningCost = diningHallCost;
          if (student.isStaffChild || student.isExempted) {
            termFees += diningCost * 0.5; // 50% for staff children/exempted
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
          description: description || `Fees for ${nextTerm} - ${student.studentType}${(student.isStaffChild || student.isExempted) ? ' (Staff/Exempted)' : ''}`,
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

export const reverseBulkInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const { currentTerm, term, startDate, endDate } = req.body || {};
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const sourceTerm = currentTerm || settings?.currentTerm || settings?.activeTerm || `Term 1 ${new Date().getFullYear()}`;
    const defaultTarget = getNextTerm(sourceTerm);
    const targetTerm = term || defaultTarget;

    const allForTargetTerm = await invoiceRepository.find({
      where: { term: targetTerm },
      order: { createdAt: 'DESC' }
    });

    if (!allForTargetTerm.length) {
      return res.status(404).json({ message: `No invoices found for ${targetTerm}` });
    }

    let windowStart: Date;
    let windowEnd: Date;
    if (startDate || endDate) {
      windowStart = startDate ? new Date(startDate) : new Date(0);
      windowEnd = endDate ? new Date(endDate) : new Date();
    } else {
      const latestCreatedAt = allForTargetTerm[0].createdAt ? new Date(allForTargetTerm[0].createdAt).getTime() : Date.now();
      windowStart = new Date(latestCreatedAt - 5 * 60 * 1000);
      windowEnd = new Date(latestCreatedAt + 5 * 60 * 1000);
    }

    const candidates = allForTargetTerm.filter(inv => {
      const created = inv.createdAt ? new Date(inv.createdAt) : new Date();
      const updated = inv.updatedAt ? new Date(inv.updatedAt) : created;
      const withinWindow = created >= windowStart && created <= windowEnd;
      const notManuallyModified = Math.abs(updated.getTime() - created.getTime()) < 2 * 60 * 1000;
      return withinWindow && notManuallyModified;
    });

    if (candidates.length < 5) {
      return res.status(400).json({ message: 'No recent bulk-created invoices detected to reverse' });
    }

    await invoiceRepository.remove(candidates);

    return res.json({
      message: `Reversed bulk creation for ${targetTerm}`,
      reversedCount: candidates.length,
      term: targetTerm
    });
  } catch (error: any) {
    console.error('Error reversing bulk invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const voidTuitionExemptInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ACCOUNTANT)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const fees = settings?.feesSettings || {};
    const dayScholarTuition = parseAmount(fees.dayScholarTuitionFee);
    const boarderTuition = parseAmount(fees.boarderTuitionFee);

    const correctionReason = 'Tuition exemption correction – system error';
    const adminId = user.id;
    const now = new Date();

    const result = await AppDataSource.manager.transaction(async (trx) => {
      const qb = trx
        .getRepository(Invoice)
        .createQueryBuilder('invoice')
        .leftJoinAndSelect('invoice.student', 'student')
        .where('invoice.status IN (:...statuses)', { statuses: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] })
        .andWhere('invoice.paidAmount = 0')
        .andWhere('COALESCE(invoice.uniformTotal, 0) = 0')
        .andWhere('(student.isExempted = true OR student.isStaffChild = true)')
        .andWhere('(invoice.amount = :dayScholarTuition OR invoice.amount = :boarderTuition)', {
          dayScholarTuition,
          boarderTuition
        })
        .orderBy('invoice.createdAt', 'DESC');

      const candidates = await qb.getMany();
      if (candidates.length === 0) {
        return { affected: 0, ids: [] as string[] };
      }

      const ids: string[] = [];
      for (const inv of candidates) {
        if (inv.status === InvoiceStatus.VOID || inv.isVoided) {
          continue;
        }
        inv.status = InvoiceStatus.VOID;
        inv.isVoided = true;
        inv.voidReason = correctionReason;
        inv.voidedAt = now;
        inv.voidByAdminId = adminId;
        inv.balance = parseAmount(inv.previousBalance);
        await trx.getRepository(Invoice).save(inv);
        ids.push(inv.id);
      }
      return { affected: ids.length, ids };
    });

    res.json({
      message: `Voided ${result.affected} tuition invoices for exempt students`,
      affectedIds: result.ids,
      reason: correctionReason,
      actedBy: adminId,
      actedAt: now
    });
  } catch (error: any) {
    console.error('Error voiding tuition-exempt invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateInvoicePDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

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

    // Net paid should reflect corrections like desk-fee reversals created as ADJUSTMENT logs.
    // This ensures invoice statements do not treat reversed desk fee as still paid.
    const statementLogs = await paymentLogRepository
      .createQueryBuilder('log')
      .where('log.invoiceId = :invoiceId', { invoiceId: invoice.id })
      .orderBy('log.createdAt', 'DESC')
      .getMany();

    const statementPositiveNonAdjustmentLogs = statementLogs.filter(l => {
      const amt = parseAmount((l as any).amountPaid);
      const pm = String((l as any).paymentMethod || '').trim().toUpperCase();
      return amt > 0 && pm !== 'ADJUSTMENT';
    });
    const statementTotalPaidToDate = statementPositiveNonAdjustmentLogs.reduce((sum, l) => sum + parseAmount((l as any).amountPaid), 0);
    const statementAdjustmentDelta = statementLogs
      .filter(l => String((l as any).paymentMethod || '').trim().toUpperCase() === 'ADJUSTMENT')
      .reduce((sum, l) => sum + parseAmount((l as any).amountPaid), 0);
    const netPaidToDate = Math.max(0, parseFloat((statementTotalPaidToDate + statementAdjustmentDelta).toFixed(2)));

    const statementInvoiceAmount = parseAmount(invoice.amount);
    const statementPreviousBalance = parseAmount(invoice.previousBalance);
    const statementPrepaidAmount = parseAmount(invoice.prepaidAmount);
    const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
    const isNewStudent = normalizedStatus === 'new';
    const deskFeeCfg = settings?.feesSettings ? parseAmount((settings.feesSettings as any).deskFee) : 0;
    const deskRounded = Math.max(0, parseFloat(parseAmount(deskFeeCfg).toFixed(2)));

    const desc = String((invoice as any).description || '');
    const deskFromDescMatch = desc.match(/desk\s*fee[^0-9]*\$?\s*(\d+(?:\.\d+)?)/i);
    const deskFromDesc = deskFromDescMatch ? Math.max(0, parseFloat(deskFromDescMatch[1])) : 0;
    const deskFromDescRounded = Math.max(0, parseFloat(parseAmount(deskFromDesc).toFixed(2)));

    console.log(
      `[generateReceiptPDF] invoice=${invoice.invoiceNumber} descDeskMatch=${deskFromDescMatch ? deskFromDescMatch[1] : 'null'} ` +
      `parsedDeskFromDesc=${deskFromDescRounded} desc=${JSON.stringify(desc)}`
    );
    const configuredDeskCandidate = (deskFromDescRounded > 0 ? deskFromDescRounded : deskRounded);

    const paidRounded = Math.max(0, parseFloat(netPaidToDate.toFixed(2)));
    const deskFeeToRemoveCapped = (!isNewStudent && configuredDeskCandidate > 0)
      ? Math.max(0, Math.min(paidRounded, configuredDeskCandidate))
      : 0;
    const paidToDisplayRaw = (deskFeeToRemoveCapped > 0)
      ? Math.max(0, parseFloat((paidRounded - deskFeeToRemoveCapped).toFixed(2)))
      : paidRounded;

    const firstInvoiceForStudent = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'ASC' }
    });
    const isFirstInvoice = firstInvoiceForStudent?.id === invoice.id;

    // When a student has been marked as Returning (Existing) via
    // "Mark selected Returning", the initial invoice is recalculated
    // in-place (one-sided journal) by correctStudentStatus().
    // For that corrected initial invoice we must *trust* the stored
    // invoice.paidAmount and invoice.balance and avoid injecting any
    // extra desk-fee math from payment logs, otherwise the desk fee
    // would sneak back into Total Paid or the outstanding balance.
    const isReturningInitialInvoice = isFirstInvoice && !isNewStudent;

    const persistedPaid = Math.max(0, parseFloat(parseAmount(invoice.paidAmount).toFixed(2)));
    const persistedBalance = Math.max(0, parseFloat(parseAmount(invoice.balance).toFixed(2)));

    const paidToDisplay = isReturningInitialInvoice ? persistedPaid : paidToDisplayRaw;
    // For invoice statements we must mirror the persisted invoice record so
    // that all parts of the system (UI, receipts, statements) show the same
    // amounts. Trust the stored paidAmount and balance instead of overriding.
    const invoiceForStatement = Object.assign({}, invoice, {
      paidAmount: invoice.paidAmount,
      balance: invoice.balance
    });

    const pdfBuffer = await createInvoicePDF({
      invoice: invoiceForStatement as any,
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
      order: { studentNumber: 'ASC' },
      relations: ['classEntity']
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
            gender: student.gender,
            studentType: student.studentType,
            className: student.classEntity?.name || null,
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

export const getOutstandingBalancesPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const allStudents = await studentRepository.find({
      order: { studentNumber: 'ASC' },
      relations: ['classEntity']
    });

    const outstandingBalances: {
      studentNumber?: string;
      studentId?: string;
      firstName?: string;
      lastName?: string;
      gender?: string;
      studentType?: string;
      className?: string | null;
      phoneNumber?: string | null;
      invoiceBalance: number;
    }[] = [];

    for (const student of allStudents) {
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      if (latestInvoice) {
        const balance = parseAmount(latestInvoice.balance);
        if (balance > 0) {
          outstandingBalances.push({
            studentNumber: student.studentNumber,
            studentId: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            gender: student.gender,
            studentType: student.studentType,
            className: student.classEntity?.name || null,
            phoneNumber: student.phoneNumber || null,
            invoiceBalance: balance
          });
        }
      }
    }

    // Display records in descending order of invoice balance (highest first)
    outstandingBalances.sort((a, b) => (b.invoiceBalance ?? 0) - (a.invoiceBalance ?? 0));

    // Fetch settings the same way as the settings page (canonical record)
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const schoolName = (settings?.schoolName != null && String(settings.schoolName).trim() !== '')
      ? String(settings.schoolName).trim()
      : 'School';
    // Currency symbol must always come from Settings (same as settings page)
    const currencySymbol = (settings?.currencySymbol != null && String(settings.currencySymbol).trim() !== '')
      ? String(settings.currencySymbol).trim()
      : 'KES';

    const pdfBuffer = await createOutstandingBalancePDF({
      schoolName,
      currencySymbol,
      reportDate: new Date(),
      balances: outstandingBalances
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="outstanding-invoices.pdf"');
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating outstanding balances PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentBalance = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query;
    
    console.log(`[getStudentBalance] Request received with studentId: ${studentId} (type: ${typeof studentId})`);
    
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID, Student Number, or Last Name is required' });
    }

    // Ensure studentId is a string
    const studentIdString = typeof studentId === 'string' ? studentId : String(studentId);
    const trimmedStudentId = studentIdString.trim();
    
    console.log(`[getStudentBalance] Processing studentId: "${trimmedStudentId}"`);
    
    if (!trimmedStudentId || trimmedStudentId === '') {
      return res.status(400).json({ message: 'Student ID, Student Number, or Last Name is required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Try to find student by ID (UUID), by studentNumber, or by lastName/firstName
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
      console.log(`[getStudentBalance] Not found by ID or studentNumber, trying lastName search for: ${trimmedStudentId}`);
      const studentsByLastName = await studentRepository
        .createQueryBuilder('student')
        .leftJoinAndSelect('student.classEntity', 'classEntity')
        .where('LOWER(student.lastName) = LOWER(:lastName)', { lastName: trimmedStudentId })
        .getMany();

      if (studentsByLastName.length === 1) {
        student = studentsByLastName[0];
        console.log(`[getStudentBalance] Student found by lastName: ${student.studentNumber} (ID: ${student.id})`);
      } else if (studentsByLastName.length > 1) {
        console.log(`[getStudentBalance] Multiple students found with lastName "${trimmedStudentId}"`);
        const matches = studentsByLastName.map(s => ({
          studentId: s.id,
          studentNumber: s.studentNumber,
          firstName: s.firstName,
          lastName: s.lastName,
          fullName: `${s.firstName} ${s.lastName}`,
          className: s.classEntity ? s.classEntity.name : null
        }));
        return res.json({
          multipleMatches: true,
          matches
        });
      } else {
        console.log(`[getStudentBalance] Not found by lastName, trying firstName search for: ${trimmedStudentId}`);
        const studentsByFirstName = await studentRepository
          .createQueryBuilder('student')
          .leftJoinAndSelect('student.classEntity', 'classEntity')
          .where('LOWER(student.firstName) = LOWER(:firstName)', { firstName: trimmedStudentId })
          .getMany();

        if (studentsByFirstName.length === 1) {
          student = studentsByFirstName[0];
          console.log(`[getStudentBalance] Student found by firstName: ${student.studentNumber} (ID: ${student.id})`);
        } else if (studentsByFirstName.length > 1) {
          console.log(`[getStudentBalance] Multiple students found with firstName "${trimmedStudentId}"`);
          const matches = studentsByFirstName.map(s => ({
            studentId: s.id,
            studentNumber: s.studentNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            fullName: `${s.firstName} ${s.lastName}`,
            className: s.classEntity ? s.classEntity.name : null
          }));
          return res.json({
            multipleMatches: true,
            matches
          });
        } else {
          console.log(`[getStudentBalance] Student not found for: ${trimmedStudentId}`);
          return res.status(404).json({
            message: 'Student not found. Please check the Student ID, Student Number, Last Name, or First Name.'
          });
        }
      }
    }
    
    console.log(`[getStudentBalance] Student found: ${student.studentNumber} (ID: ${student.id}, userId: ${student.userId || 'null'})`);

    // Query invoices using multiple criteria to handle reference mismatches
    const invoiceQueryBuilder = invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('invoice.studentId = :studentId', { studentId: student.id })
      .orWhere('student.studentNumber = :studentNumber', { studentNumber: student.studentNumber })
      .orderBy('invoice.createdAt', 'DESC');

    const allInvoicesRaw = await invoiceQueryBuilder.getMany();
    const allInvoices = allInvoicesRaw.filter(inv => 
      inv.studentId === student.id || 
      (inv.student && inv.student.studentNumber === student.studentNumber)
    );

    const lastInvoice = allInvoices.length > 0 ? allInvoices[0] : null;

    let currentBalance = 0;
    let totalPrepaidAmount = 0;
    
    console.log(`[getStudentBalance] Found ${allInvoices.length} invoice(s) for student ${student.studentNumber} (${student.id})`);
    
    if (!lastInvoice) {
      currentBalance = 0;
      console.log(`[getStudentBalance] No invoices found, balance = 0`);
    } else {
      // Derive balance from the same invoice components used by statements/receipts,
      // instead of trusting the persisted balance field, which may include legacy
      // desk-fee or adjustment artefacts.
      const invAmount = parseAmount(lastInvoice.amount);
      const invPrevBalance = parseAmount(lastInvoice.previousBalance);
      const invPaid = parseAmount(lastInvoice.paidAmount);
      const invPrepaid = parseAmount(lastInvoice.prepaidAmount);

      currentBalance = Math.max(
        0,
        parseFloat((invAmount + invPrevBalance - invPaid - invPrepaid).toFixed(2))
      );
      totalPrepaidAmount = Math.max(0, parseFloat(invPrepaid.toFixed(2)));

      console.log(
        `[getStudentBalance] Latest invoice ${lastInvoice.invoiceNumber}: ` +
        `amount=${invAmount}, previousBalance=${invPrevBalance}, paid=${invPaid}, ` +
        `prepaid=${invPrepaid}, derivedBalance=${currentBalance}`
      );
      for (const invoice of allInvoices) {
        const invBalStored = parseAmount(invoice.balance);
        const invPrev = parseAmount(invoice.previousBalance);
        console.log(
          `[getStudentBalance] Invoice ${invoice.invoiceNumber} (${invoice.term}): ` +
          `storedBalance=${invBalStored}, previousBalance=${invPrev}, amount=${parseAmount(invoice.amount)}`
        );
      }
    }

    const lastInvoiceAmount = lastInvoice ? parseAmount(lastInvoice.amount) : 0;
    const lastInvoiceBalance = currentBalance;
    let previousBalance = lastInvoice ? parseAmount(lastInvoice.previousBalance) : 0;
    let paidAmount = lastInvoice ? parseAmount(lastInvoice.paidAmount) : 0;
    if (lastInvoice) {
      // Ensure response fields reflect the same corrected values used to compute currentBalance.
      previousBalance = Math.max(
        0,
        parseFloat(parseAmount((lastInvoice as any).previousBalance ?? 0).toFixed(2))
      );
      paidAmount = Math.max(
        0,
        parseFloat(
          (Number(lastInvoiceAmount) + Number(previousBalance) - Number(currentBalance) - Number(totalPrepaidAmount)).toFixed(2)
        )
      );
    }

    console.log(`[getStudentBalance] Final balance for student ${student.studentNumber}: ${currentBalance}`);

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.lastName} ${student.firstName}`,
      studentStatus: (student as any).studentStatus || null,
      studentType: (student as any).studentType || null,
      usesTransport: !!(student as any).usesTransport,
      isStaffChild: !!student.isStaffChild,
      isExempted: !!student.isExempted,
      usesDiningHall: !!student.usesDiningHall,
      balance: currentBalance,
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
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

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

    const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
    const isNewStudent = normalizedStatus === 'new';
    const deskFeeCfg = settings?.feesSettings ? parseAmount((settings.feesSettings as any).deskFee) : 0;

    // Prefer real payment logs over invoice.paidAmount to avoid showing desk-fee reversals/adjustments as "paid"
    const normalizePm = (pm: any): string | null => {
      const v = String(pm || '').trim();
      return v ? v : null;
    };

    const paymentLogs = await paymentLogRepository
      .createQueryBuilder('log')
      .where('log.invoiceId = :invoiceId', { invoiceId: invoice.id })
      .orderBy('log.createdAt', 'DESC')
      .getMany();

    const positiveNonAdjustmentLogs = paymentLogs.filter(l => {
      const amt = parseAmount((l as any).amountPaid);
      const pm = String((l as any).paymentMethod || '').trim().toUpperCase();
      return amt > 0 && pm !== 'ADJUSTMENT';
    });

    const latestPaymentLog = positiveNonAdjustmentLogs.length > 0 ? positiveNonAdjustmentLogs[0] : null;
    const totalPaidToDate = positiveNonAdjustmentLogs.reduce((sum, l) => sum + parseAmount((l as any).amountPaid), 0);

    // Align with invoice statement logic: include ADJUSTMENT logs when computing net paid,
    // so receipts and invoice PDFs agree on total paid-to-date for the invoice.
    const statementAdjustmentDelta = paymentLogs
      .filter(l => String((l as any).paymentMethod || '').trim().toUpperCase() === 'ADJUSTMENT')
      .reduce((sum, l) => sum + parseAmount((l as any).amountPaid), 0);

    // Business rule: net paid includes adjustments, then desk-fee specific rules may
    // later remove the desk portion for returning students when presenting totals.
    const persistedPaidFallback = Math.max(0, parseFloat(parseAmount(invoice.paidAmount).toFixed(2)));
    const rawNetPaid = totalPaidToDate + statementAdjustmentDelta;
    const netPaidToDate = (latestPaymentLog || rawNetPaid !== 0)
      ? Math.max(0, parseFloat(rawNetPaid.toFixed(2)))
      : persistedPaidFallback;

    // Identify the student's first invoice (initial invoice) to mirror
    // the same "returning initial invoice" semantics used by the
    // invoice statement generation.
    const firstInvoiceForStudent = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'ASC' }
    });
    const isFirstInvoice = firstInvoiceForStudent?.id === invoice.id;
    const isReturningInitialInvoice = isFirstInvoice && !isNewStudent;

    // If the student is Returning/Existing and the paid total exceeds the corrected invoice total
    // by exactly the configured desk fee, the receipt must display paid amounts with desk fee removed.
    const correctedInvoiceTotal = Math.max(0, parseFloat(parseAmount(invoice.amount).toFixed(2)));
    const deskRounded = Math.max(0, parseFloat(parseAmount(deskFeeCfg).toFixed(2)));
    const paidRounded = Math.max(0, parseFloat(netPaidToDate.toFixed(2)));
    const overpay = Math.max(0, parseFloat((paidRounded - correctedInvoiceTotal).toFixed(2)));

    const desc = String((invoice as any).description || '');
    const deskFromDescMatch = desc.match(/desk\s*fee[^0-9]*\$?\s*(\d+(?:\.\d+)?)/i);
    const deskFromDesc = deskFromDescMatch ? Math.max(0, parseFloat(deskFromDescMatch[1])) : 0;
    const deskFromDescRounded = Math.max(0, parseFloat(parseAmount(deskFromDesc).toFixed(2)));

    const configuredDeskCandidate = (deskFromDescRounded > 0 ? deskFromDescRounded : deskRounded);

    let deskFeeToRemove = 0;
    if (!isNewStudent) {
      const deltaPaidVsPersisted = Math.max(0, parseFloat((paidRounded - persistedPaidFallback).toFixed(2)));
      const invoiceBalRounded = Math.max(0, parseFloat(parseAmount((invoice as any).balance).toFixed(2)));
      const invoicePrevRounded = Math.max(0, parseFloat(parseAmount((invoice as any).previousBalance).toFixed(2)));
      const invoicePrepaidRounded = Math.max(0, parseFloat(parseAmount((invoice as any).prepaidAmount).toFixed(2)));
      const expectedPaidFromInvoice = Math.max(
        0,
        parseFloat((correctedInvoiceTotal + invoicePrevRounded - invoiceBalRounded - invoicePrepaidRounded).toFixed(2))
      );
      const deltaPaidVsInvoice = Math.max(0, parseFloat((paidRounded - expectedPaidFromInvoice).toFixed(2)));

      // When a returning student was incorrectly treated as having paid desk fee,
      // receipts/statements must not include that portion in Total Paid or Amount Paid.
      // If we detect an explicit overpay scenario, remove the overpay (typically desk fee).
      // Otherwise (partial payments), remove the configured desk fee value (prefer description).
      if (deltaPaidVsPersisted > 0) {
        deskFeeToRemove = deltaPaidVsPersisted;
      } else if (deltaPaidVsInvoice > 0) {
        // Primary signal: payment logs indicate more paid than what the invoice balance math expects.
        // This mismatch is the historical desk fee portion that must be removed from paid display.
        deskFeeToRemove = deltaPaidVsInvoice;
      } else if (overpay > 0) {
        if (deskFromDescRounded > 0 && Math.abs(overpay - deskFromDescRounded) < 0.01) {
          deskFeeToRemove = deskFromDescRounded;
        } else if (deskRounded > 0 && Math.abs(overpay - deskRounded) < 0.01) {
          deskFeeToRemove = deskRounded;
        } else {
          deskFeeToRemove = overpay;
        }
      } else if (configuredDeskCandidate > 0) {
        deskFeeToRemove = configuredDeskCandidate;
      }
    }

    // Cap removal to what was actually paid-to-date.
    const deskFeeToRemoveCapped = Math.max(0, Math.min(paidRounded, parseFloat(deskFeeToRemove.toFixed(2))));
    const shouldRemoveDeskFromPaid = deskFeeToRemoveCapped > 0;
    const paidToDisplay = shouldRemoveDeskFromPaid
      ? Math.max(0, parseFloat((paidRounded - deskFeeToRemoveCapped).toFixed(2)))
      : paidRounded;

    console.log(
      `[generateReceiptPDF] student=${student.studentNumber} status=${String((student as any).studentStatus || '')} ` +
      `isNew=${isNewStudent} deskFee=${deskRounded} invoiceAmount=${correctedInvoiceTotal} ` +
      `paidFromLogs=${paidRounded} overpay=${overpay} removeDesk=${shouldRemoveDeskFromPaid} paidToDisplay=${paidToDisplay}`
    );

    // Hard guard: do not generate a "PAYMENT RECEIPT" when there is no evidence of an actual payment.
    // This prevents misleading receipts showing Amount Paid = 0.00 with an outstanding balance.
    const persistedPaid = Math.max(0, parseFloat(parseAmount(invoice.paidAmount).toFixed(2)));
    const persistedPrepaid = Math.max(0, parseFloat(parseAmount(invoice.prepaidAmount).toFixed(2)));
    if (!latestPaymentLog && netPaidToDate <= 0 && persistedPaid <= 0 && persistedPrepaid <= 0) {
      return res.status(404).json({ message: 'Receipt not found for this invoice (no payment recorded).' });
    }

    const receiptNumber = latestPaymentLog?.receiptNumber
      ? String(latestPaymentLog.receiptNumber)
      : `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    const resolvedPaymentAmount = paymentAmount
      ? parseAmount(paymentAmount)
      : (latestPaymentLog ? parseAmount((latestPaymentLog as any).amountPaid) : netPaidToDate);

    // Guardrail: after desk-fee reversals/status corrections, invoice totals may be reduced.
    // Never display an "Amount Paid" on a receipt that exceeds the actual cash paid-to-date.
    const effectiveResolvedPaymentAmount = (resolvedPaymentAmount > 0)
      ? resolvedPaymentAmount
      : (latestPaymentLog ? parseAmount((latestPaymentLog as any).amountPaid) : netPaidToDate);
    let safePaymentAmount = Math.min(effectiveResolvedPaymentAmount, paidRounded);
    if (shouldRemoveDeskFromPaid) {
      const amtRounded = Math.max(0, parseFloat(safePaymentAmount.toFixed(2)));
      const removalForThisReceipt = Math.max(0, Math.min(amtRounded, deskFeeToRemoveCapped));
      // Remove the desk-fee portion from the single payment shown on the receipt.
      safePaymentAmount = Math.max(0, parseFloat((amtRounded - removalForThisReceipt).toFixed(2)));
    }

    // For the corrected initial invoice of a Returning/Existing student,
    // the receipt must present the same "Amount Paid" and remaining balance
    // as the invoice statement, which trusts the persisted paidAmount after
    // status correction. Override the per-log Amount Paid with paidToDisplay.
    if (isReturningInitialInvoice) {
      safePaymentAmount = paidToDisplay;
    }

    console.log(
      `[generateReceiptPDF] receipt=${receiptNumber} resolvedPaymentAmount=${resolvedPaymentAmount} safePaymentAmount=${safePaymentAmount}`
    );

    const resolvedPaymentDate = paymentDate
      ? new Date(paymentDate as string)
      : (latestPaymentLog?.paymentDate ? new Date(latestPaymentLog.paymentDate) : new Date());

    const resolvedPaymentMethod = latestPaymentLog ? normalizePm(latestPaymentLog.paymentMethod) : null;
    const resolvedNotes = latestPaymentLog?.notes ? String(latestPaymentLog.notes) : undefined;

    // Derive canonical paid & balance from the invoice record itself so that
    // receipts and invoice statements ALWAYS agree for the same invoice.
    // paid = amount + previousBalance - balance - prepaidAmount
    const invAmount = parseAmount(invoice.amount);
    const invPrev = parseAmount(invoice.previousBalance);
    const invBal = parseAmount(invoice.balance);
    const invPrepaid = parseAmount(invoice.prepaidAmount);
    const canonicalPaidFromInvoice = Math.max(
      0,
      parseFloat((invAmount + invPrev - invBal - invPrepaid).toFixed(2))
    );
    const canonicalBalanceFromInvoice = Math.max(0, parseFloat(invBal.toFixed(2)));

    // Override invoice fields for the receipt so both receipt and invoice
    // statements use the exact same paid & balance figures.
    const invoiceForReceipt = Object.assign({}, invoice, {
      paidAmount: canonicalPaidFromInvoice,
      balance: canonicalBalanceFromInvoice
    });

    const pdfBuffer = await createReceiptPDF({
      invoice: invoiceForReceipt as any,
      student,
      settings,
      // For presentation, the receipt's "Amount Paid" must match the invoice's
      // total paid figure, not the last raw log amount.
      paymentAmount: canonicalPaidFromInvoice,
      paymentDate: resolvedPaymentDate,
      paymentMethod: resolvedPaymentMethod || undefined,
      notes: resolvedNotes,
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

export const getPaymentLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, invoiceId, search, startDate, endDate, paymentMethod, page: pageParam, limit: limitParam } = req.query as { studentId?: string; invoiceId?: string; search?: string; startDate?: string; endDate?: string; paymentMethod?: string; page?: string; limit?: string };
    const { page, limit, skip } = resolvePaginationParams(pageParam, limitParam);
    const repo = AppDataSource.getRepository(PaymentLog);
    const qb = repo.createQueryBuilder('log')
      .leftJoinAndSelect('log.student', 'student')
      .leftJoinAndSelect('log.invoice', 'invoice')
      .orderBy('log.createdAt', 'DESC');
    if (studentId) {
      qb.andWhere('log.studentId = :studentId', { studentId });
    }
    if (invoiceId) {
      qb.andWhere('log.invoiceId = :invoiceId', { invoiceId });
    }
    if (paymentMethod) {
      qb.andWhere('LOWER(log.paymentMethod) = LOWER(:pm)', { pm: paymentMethod });
    }
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      qb.andWhere('(LOWER(log.receiptNumber) LIKE :s OR LOWER(log.payerName) LIKE :s OR LOWER(log.paymentMethod) LIKE :s OR LOWER(student.firstName) LIKE :s OR LOWER(student.lastName) LIKE :s OR LOWER(invoice.invoiceNumber) LIKE :s)', { s });
    }
    if (startDate) {
      qb.andWhere('log.paymentDate >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      qb.andWhere('log.paymentDate <= :endDate', { endDate: new Date(endDate) });
    }
    qb.skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();
    // Compute duplicate receipts set across filtered scope
    const dupQb = repo.createQueryBuilder('log')
      .select('log.receiptNumber', 'receiptNumber')
      .addSelect('COUNT(*)', 'cnt');
    if (studentId) dupQb.andWhere('log.studentId = :studentId', { studentId });
    if (invoiceId) dupQb.andWhere('log.invoiceId = :invoiceId', { invoiceId });
    if (paymentMethod) dupQb.andWhere('LOWER(log.paymentMethod) = LOWER(:pm)', { pm: paymentMethod });
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      dupQb.andWhere('(LOWER(log.receiptNumber) LIKE :s OR LOWER(log.payerName) LIKE :s OR LOWER(log.paymentMethod) LIKE :s)', { s });
    }
    if (startDate) dupQb.andWhere('log.paymentDate >= :startDate', { startDate: new Date(startDate) });
    if (endDate) dupQb.andWhere('log.paymentDate <= :endDate', { endDate: new Date(endDate) });
    dupQb.groupBy('log.receiptNumber').having('COUNT(*) > 1');
    const dupRows = await dupQb.getRawMany();
    const duplicates = dupRows.map((r: any) => r.receiptNumber).filter((v: any) => !!v);

    const response = buildPaginationResponse(data, total, page, limit);
    (response as any).duplicates = duplicates;
    res.json(response);
  } catch (error: any) {
    console.error('Error fetching payment logs:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const exportPaymentLogsCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, invoiceId, search, startDate, endDate, paymentMethod } = req.query as any;
    const repo = AppDataSource.getRepository(PaymentLog);
    const qb = repo.createQueryBuilder('log')
      .leftJoinAndSelect('log.student', 'student')
      .leftJoinAndSelect('log.invoice', 'invoice')
      .orderBy('log.createdAt', 'DESC');
    if (studentId) qb.andWhere('log.studentId = :studentId', { studentId });
    if (invoiceId) qb.andWhere('log.invoiceId = :invoiceId', { invoiceId });
    if (paymentMethod) qb.andWhere('LOWER(log.paymentMethod) = LOWER(:pm)', { pm: paymentMethod });
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      qb.andWhere('(LOWER(log.receiptNumber) LIKE :s OR LOWER(log.payerName) LIKE :s OR LOWER(log.paymentMethod) LIKE :s OR LOWER(student.firstName) LIKE :s OR LOWER(student.lastName) LIKE :s OR LOWER(invoice.invoiceNumber) LIKE :s)', { s });
    }
    if (startDate) qb.andWhere('log.paymentDate >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('log.paymentDate <= :endDate', { endDate: new Date(endDate) });
    const rows = await qb.getMany();
    const headers = ['Invoice/Receipt','Recipient','Student ID','Paid','Payment Date','Payment Method','Reference','Updated'];
    const csvLines = [headers.join(',')];
    for (const log of rows) {
      const student = (log as any).student || {};
      const invoice = (log as any).invoice || {};
      csvLines.push([
        invoice.invoiceNumber || log.receiptNumber || log.invoiceId,
        `${student.firstName || ''} ${student.lastName || ''}`.trim().replace(/,/g,' '),
        student.studentNumber || '',
        String(log.amountPaid ?? 0),
        log.paymentDate ? new Date(log.paymentDate).toISOString().slice(0,10) : '',
        log.paymentMethod || '',
        log.receiptNumber || '',
        log.createdAt ? new Date(log.createdAt).toISOString() : ''
      ].join(','));
    }
    const csv = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-payments.csv"');
    res.send(csv);
  } catch (error: any) {
    console.error('Error exporting payment logs CSV:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getPaymentLogsSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, invoiceId, search, startDate, endDate, paymentMethod } = req.query as any;
    const repo = AppDataSource.getRepository(PaymentLog);
    const qb = repo.createQueryBuilder('log').select('SUM(log.amountPaid)', 'sumPaid').addSelect('COUNT(*)', 'count');
    if (studentId) qb.andWhere('log.studentId = :studentId', { studentId });
    if (invoiceId) qb.andWhere('log.invoiceId = :invoiceId', { invoiceId });
    if (paymentMethod) qb.andWhere('LOWER(log.paymentMethod) = LOWER(:pm)', { pm: paymentMethod });
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      qb.andWhere('(LOWER(log.receiptNumber) LIKE :s OR LOWER(log.payerName) LIKE :s OR LOWER(log.paymentMethod) LIKE :s)', { s });
    }
    if (startDate) qb.andWhere('log.paymentDate >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('log.paymentDate <= :endDate', { endDate: new Date(endDate) });
    const result = await qb.getRawOne();
    res.json({ sumPaid: parseFloat(result?.sumPaid || '0'), count: parseInt(result?.count || '0', 10) });
  } catch (error: any) {
    console.error('Error fetching payment logs summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const exportInvoicesCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { status, search } = req.query as any;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const qb = invoiceRepository.createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .orderBy('invoice.createdAt', 'DESC');
    if (status) qb.andWhere('invoice.status = :status', { status });
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      qb.andWhere('(LOWER(invoice.invoiceNumber) LIKE :s OR LOWER(student.firstName) LIKE :s OR LOWER(student.lastName) LIKE :s OR LOWER(student.studentNumber) LIKE :s)', { s });
    }
    const rows = await qb.getMany();
    const headers = ['Invoice No','Recipient','Student ID','Status','Amount','Paid','Balance','Prev Balance','Prepaid','Term','Due Date','Created','Updated'];
    const csvLines = [headers.join(',')];
    for (const inv of rows) {
      const student = (inv as any).student || {};
      csvLines.push([
        inv.invoiceNumber,
        `${student.firstName || ''} ${student.lastName || ''}`.trim().replace(/,/g,' '),
        student.studentNumber || '',
        inv.status,
        String(inv.amount ?? 0),
        String(inv.paidAmount ?? 0),
        String(inv.balance ?? 0),
        String(inv.previousBalance ?? 0),
        String(inv.prepaidAmount ?? 0),
        inv.term || '',
        inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0,10) : '',
        inv.createdAt ? new Date(inv.createdAt).toISOString() : '',
        inv.updatedAt ? new Date(inv.updatedAt).toISOString() : ''
      ].join(','));
    }
    const csv = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-invoices.csv"');
    res.send(csv);
  } catch (error: any) {
    console.error('Error exporting invoices CSV:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getInvoicesSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { status, search } = req.query as any;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const qb = invoiceRepository.createQueryBuilder('invoice')
      .leftJoin('invoice.student', 'student')
      .select('SUM(invoice.paidAmount)', 'sumPaid')
      .addSelect('SUM(invoice.balance)', 'sumBalance')
      .addSelect('COUNT(*)', 'count');
    if (status) qb.andWhere('invoice.status = :status', { status });
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      qb.andWhere('(LOWER(invoice.invoiceNumber) LIKE :s OR LOWER(student.firstName) LIKE :s OR LOWER(student.lastName) LIKE :s OR LOWER(student.studentNumber) LIKE :s)', { s });
    }
    const result = await qb.getRawOne();
    res.json({
      sumPaid: parseFloat(result?.sumPaid || '0'),
      sumBalance: parseFloat(result?.sumBalance || '0'),
      count: parseInt(result?.count || '0', 10)
    });
  } catch (error: any) {
    console.error('Error fetching invoices summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const normalizeHistoricalPaymentMethods = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const repo = AppDataSource.getRepository(PaymentLog);
    const logs = await repo.find();
    let updated = 0;
    let skipped = 0;
    const allowed = new Set(['CASH(USD)', 'ECOCASH(USD)', 'BANK TRANSFER(USD)']);
    for (const log of logs) {
      const nm = normalizePaymentMethod(log.paymentMethod || '');
      const finalMethod = nm || 'CASH(USD)';
      if (!allowed.has(finalMethod) || log.paymentMethod !== finalMethod) {
        log.paymentMethod = finalMethod;
        await repo.save(log);
        updated++;
      } else {
        skipped++;
      }
    }
    res.json({ message: 'Normalization complete', updated, skipped, total: logs.length });
  } catch (error: any) {
    console.error('Error normalizing payment methods:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const repairReturningDeskFeeInvoices = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { dryRun, limit } = (req.body || {}) as { dryRun?: boolean; limit?: number };
    const effectiveDryRun = dryRun !== undefined ? !!dryRun : true;
    const effectiveLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(5000, Number(limit)) : 500;

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

    const settings = await settingsRepository.findOne({ where: {}, order: { createdAt: 'DESC' } });
    const deskFeeCfg = settings?.feesSettings ? parseAmount((settings.feesSettings as any).deskFee) : 0;
    if (!Number.isFinite(deskFeeCfg) || deskFeeCfg <= 0) {
      return res.status(400).json({ message: 'Desk fee is not configured in Settings (feesSettings.deskFee)' });
    }

    const deskFeeRounded = parseFloat(deskFeeCfg.toFixed(2));

    const candidates = await invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('student.studentStatus IS NOT NULL')
      .andWhere('LOWER(student.studentStatus) <> :newStatus', { newStatus: 'new' })
      .andWhere('ROUND(CAST(invoice.previousBalance AS numeric), 2) = :deskFee', { deskFee: deskFeeRounded })
      .andWhere('invoice.isVoided = false')
      .orderBy('invoice.createdAt', 'DESC')
      .limit(effectiveLimit)
      .getMany();

    let updatedInvoices = 0;
    let deletedAdjustmentLogs = 0;
    let skippedAlreadyRepaired = 0;

    const preview = candidates.map(inv => {
      const st = (inv as any).student || {};
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        studentId: inv.studentId,
        studentNumber: st.studentNumber || null,
        studentStatus: st.studentStatus || null,
        term: inv.term,
        previousBalance: parseAmount(inv.previousBalance),
        amount: parseAmount(inv.amount),
        paidAmount: parseAmount(inv.paidAmount),
        prepaidAmount: parseAmount(inv.prepaidAmount),
        balance: parseAmount(inv.balance)
      };
    });

    if (effectiveDryRun) {
      return res.json({
        message: 'Dry run: no changes applied',
        deskFee: deskFeeRounded,
        limit: effectiveLimit,
        found: candidates.length,
        preview
      });
    }

    for (const invoice of candidates) {
      const student = (invoice as any).student || (await studentRepository.findOne({ where: { id: invoice.studentId } }));
      const normalizedStatus = String(student?.studentStatus || '').trim().toLowerCase();
      if (!normalizedStatus || normalizedStatus === 'new') {
        continue;
      }

      const prevBal = parseFloat(parseAmount(invoice.previousBalance).toFixed(2));
      if (prevBal !== deskFeeRounded) {
        skippedAlreadyRepaired++;
        continue;
      }

      const existingAdj = await paymentLogRepository
        .createQueryBuilder('log')
        .where('log.invoiceId = :invoiceId', { invoiceId: invoice.id })
        .andWhere('UPPER(COALESCE(log.paymentMethod, \'\')) = :pm', { pm: 'ADJUSTMENT' })
        .andWhere('ROUND(CAST(log.amountPaid AS numeric), 2) = :amt', { amt: -Math.abs(deskFeeRounded) })
        .getOne();

      const oldAmount = parseFloat(parseAmount(invoice.amount).toFixed(2));
      const oldPrepaid = parseFloat(parseAmount(invoice.prepaidAmount).toFixed(2));

      invoice.previousBalance = 0;
      const paid = parseFloat(parseAmount(invoice.paidAmount).toFixed(2));
      invoice.balance = Math.max(0, parseFloat((oldAmount + 0 - paid - oldPrepaid).toFixed(2)));

      if (invoice.balance <= 0) {
        invoice.status = InvoiceStatus.PAID;
      } else if (invoice.paidAmount && parseAmount(invoice.paidAmount) > 0) {
        invoice.status = InvoiceStatus.PARTIAL;
      } else {
        invoice.status = InvoiceStatus.PENDING;
      }
      if (new Date() > invoice.dueDate && invoice.balance > 0) {
        invoice.status = InvoiceStatus.OVERDUE;
      }

      await invoiceRepository.save(invoice);
      updatedInvoices++;

      if (existingAdj) {
        await paymentLogRepository.remove(existingAdj);
        deletedAdjustmentLogs++;
      }
    }

    res.json({
      message: 'Repair complete',
      deskFee: deskFeeRounded,
      limit: effectiveLimit,
      found: candidates.length,
      updatedInvoices,
      deletedAdjustmentLogs,
      skippedAlreadyRepaired
    });
  } catch (error: any) {
    console.error('Error repairing returning desk fee invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

