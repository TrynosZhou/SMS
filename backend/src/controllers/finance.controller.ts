import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { createInvoicePDF } from '../utils/invoicePdfGenerator';
import { createReceiptPDF, createUniformReceiptPDF } from '../utils/receiptPdfGenerator';
import { createOutstandingBalancePDF } from '../utils/outstandingBalancePdfGenerator';
import { createCashReceiptsPDF } from '../utils/cashReceiptsPdfGenerator';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount } from '../utils/numberUtils';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';
import { UserRole } from '../entities/User';
import { PaymentLog } from '../entities/PaymentLog';
import { UniformCharge } from '../entities/UniformCharge';
import { UniformChargeItem } from '../entities/UniformChargeItem';
import { UniformPaymentLog } from '../entities/UniformPaymentLog';
import { Brackets } from 'typeorm';

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
    // Base amount for this invoice comes from explicit tuition/dining/other
    // components; we don't trust a combined "amount" from the client.
    let baseAmount = 0;
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

    // Uniform items are kept separate from tuition; do not add to this invoice. Use POST /finance/uniform-charge for uniform.
    const uniformTotal = 0;
    const uniformItemsEntities: InvoiceUniformItem[] = [];

    // Tuition/dining/other components explicitly provided in the payload
    const tuitionVal = parseAmount(tuitionAmount);
    const diningVal = parseAmount(diningHallAmount);
    const otherVal = parseAmount(otherAmount);
    const registrationVal = registrationIncrement;
    const deskVal = deskIncrement;
    const transportVal = transportIncrement;

    // Prevent duplicate term fees but allow uniform-only invoices in same term
    const isTermFeeInvoice = (tuitionVal > 0) || (diningVal > 0) || (transportVal > 0);

    // Calculate new-term amount as the sum of all non-uniform fee components
    const amountNumRaw = tuitionVal + diningVal + otherVal + transportVal + registrationVal + deskVal;
    const amountNum = Number.isFinite(amountNumRaw) ? amountNumRaw : 0;

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
      uniformItems: uniformItemsEntities,
      tuitionAmount: tuitionVal,
      transportAmount: transportVal,
      diningHallAmount: diningVal,
      registrationAmount: registrationVal,
      deskFeeAmount: deskVal
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
      .andWhere('COALESCE(invoice.isVoided, false) = false')
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
      .select('COALESCE(SUM(invoice.balance), 0)', 'totalBalance')
      .addSelect('COALESCE(SUM(invoice.amount), 0)', 'totalInvoicedAmount')
      .addSelect('COALESCE(SUM(invoice.paidAmount), 0)', 'totalPaidAmount')
      .andWhere('COALESCE(invoice.isVoided, false) = false');

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
    const totalInvoicedAmount = Number(sumRaw?.totalInvoicedAmount ?? 0);
    const totalPaidAmount = Number(sumRaw?.totalPaidAmount ?? 0);

    res.json(
      buildPaginationResponse(invoices, total, page, limit, {
        totalBalance,
        totalInvoicedAmount,
        totalPaidAmount
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
    const { term, dueDate, description, batchOffset: batchOffsetBody, batchSize: batchSizeBody } = req.body;

    if (!term || !dueDate) {
      return res.status(400).json({ message: 'Current term and due date are required' });
    }

    const batchSizeNum = batchSizeBody != null && batchSizeBody !== '' ? Number(batchSizeBody) : NaN;
    const batchMode = Number.isFinite(batchSizeNum) && batchSizeNum > 0;
    const batchOffset = batchMode ? Math.max(0, parseInt(String(batchOffsetBody ?? 0), 10) || 0) : 0;
    const batchSize = batchMode ? Math.min(500, Math.max(1, Math.floor(batchSizeNum))) : 0;

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
    // Library, sports, and other fees are no longer part of the term fee
    // structure. Bulk invoices must only include tuition, one‑time desk fee,
    // one‑time registration fee, transport, and dining hall as configured.

    // Get all active students (stable order so batch offsets are repeatable)
    const students = await studentRepository.find({
      where: { isActive: true },
      relations: ['classEntity'],
      order: { lastName: 'ASC', firstName: 'ASC', id: 'ASC' }
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No active students found' });
    }

    const studentsToProcess = batchMode
      ? students.slice(batchOffset, batchOffset + batchSize)
      : students;
    const nextOffset = batchOffset + studentsToProcess.length;
    const hasMore = batchMode && nextOffset < students.length;

    const results = {
      total: students.length,
      created: 0,
      failed: 0,
      invoices: [] as any[],
      errors: [] as string[]
    };

    // Next invoice number must follow the highest existing sequence for this year — count() can be lower if rows were removed or numbers are non-contiguous
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

    // Process each student (full list, or one batch when batchMode)
    for (const student of studentsToProcess) {
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
        
        // Ignore voided invoices so a replacement can be generated after voiding
        const existingNextTermInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id, term: nextTerm, isVoided: false }
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

        // Generate invoice number (advance sequence only after we commit to this number)
        const invoiceNumber = `${invoicePrefix}${String(nextSequence).padStart(6, '0')}`;

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
        nextSequence += 1;

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

    const baseMessage = `Bulk invoice creation completed. Created: ${results.created}, Failed: ${results.failed}`;

    if (batchMode) {
      const rangeMsg =
        studentsToProcess.length === 0
          ? `(no students in range offset ${batchOffset})`
          : `(students ${batchOffset + 1}–${nextOffset} of ${students.length})`;
      return res.status(201).json({
        message: `${baseMessage} ${rangeMsg}`,
        summary: {
          ...results,
          batchOffset,
          batchProcessed: studentsToProcess.length
        },
        batch: {
          offset: batchOffset,
          nextOffset,
          totalStudents: students.length,
          hasMore
        }
      });
    }

    res.status(201).json({
      message: baseMessage,
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
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Load settings once to get desk fee (used for returning-student adjustment logic)
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });
    const configuredDeskFee = settings && (settings as any).feesSettings
      ? Number((settings as any).feesSettings.deskFee || 0)
      : 0;

    // Get all students
    const allStudents = await studentRepository.find({
      order: { studentNumber: 'ASC' },
      relations: ['classEntity']
    });

    // Get latest invoice for each student in a single query
    const outstandingBalances = [];

    for (const student of allStudents) {
      // Get the latest non-voided invoice for this student
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id, isVoided: false },
        order: { createdAt: 'DESC' }
      });

      if (latestInvoice) {
        const tryNum = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);

        const invoiceAmount = tryNum(latestInvoice.amount);
        let previousBalance = tryNum(latestInvoice.previousBalance);
        const paidAmount = tryNum(latestInvoice.paidAmount);
        const prepaidAmount = tryNum(latestInvoice.prepaidAmount);

        // Match the same desk-fee / returning-student adjustment logic
        // used by the invoice-statement preview and receipt PDFs.
        const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
        const isNewStudent = normalizedStatus === 'new';

        if (!isNewStudent && configuredDeskFee > 0) {
          const prev = Number(previousBalance.toFixed(2));
          const desk = Number(configuredDeskFee.toFixed(2));
          if (prev === desk) {
            previousBalance = 0;
          }
        }

        const computedBalance = Math.max(
          0,
          (invoiceAmount + previousBalance) - paidAmount - prepaidAmount
        );

        const balance = computedBalance;
        
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
        where: { studentId: student.id, isVoided: false },
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

    const schoolLogo2 = (settings as any)?.schoolLogo2 ?? null;
    const pdfBuffer = await createOutstandingBalancePDF({
      schoolName,
      currencySymbol,
      reportDate: new Date(),
      balances: outstandingBalances,
      schoolLogo2: schoolLogo2 != null ? String(schoolLogo2).trim() : null
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

    const uniformBalance = Math.max(0, parseFloat(parseAmount((student as any).uniformBalance ?? 0).toFixed(2)));
    console.log(`[getStudentBalance] Final balance for student ${student.studentNumber}: ${currentBalance}, uniformBalance: ${uniformBalance}`);

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
      uniformBalance,
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

/** Create a uniform charge for a student (separate from tuition). Updates Student.uniformBalance. */
export const createUniformCharge = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, items, description } = req.body;
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformChargeRepository = AppDataSource.getRepository(UniformCharge);
    const uniformChargeItemRepository = AppDataSource.getRepository(UniformChargeItem);
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one uniform item is required' });
    }

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let totalAmount = 0;
    const chargeItems: { itemName: string; unitPrice: number; quantity: number; lineTotal: number }[] = [];

    for (const row of items) {
      const itemId = row.itemId || row.uniformItemId;
      const qty = parseInt(String(row.quantity || 0), 10);
      if (!itemId || qty < 1) continue;
      const uniformItem = await uniformItemRepository.findOne({ where: { id: itemId } });
      if (!uniformItem || !uniformItem.isActive) {
        return res.status(400).json({ message: `Invalid or inactive uniform item: ${itemId}` });
      }
      const unitPrice = parseAmount(uniformItem.unitPrice);
      const lineTotal = parseFloat((unitPrice * qty).toFixed(2));
      totalAmount += lineTotal;
      chargeItems.push({
        itemName: uniformItem.name,
        unitPrice,
        quantity: qty,
        lineTotal
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({ message: 'Total uniform amount must be greater than zero' });
    }

    const charge = uniformChargeRepository.create({
      studentId: student.id,
      amount: parseFloat(totalAmount.toFixed(2)),
      description: description || `Uniform items: ${chargeItems.map(i => i.itemName).join(', ')}`
    });
    const savedCharge = await uniformChargeRepository.save(charge);

    for (const it of chargeItems) {
      const item = uniformChargeItemRepository.create({
        uniformChargeId: savedCharge.id,
        itemName: it.itemName,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal
      });
      await uniformChargeItemRepository.save(item);
    }

    const currentUniformBalance = parseAmount((student as any).uniformBalance ?? 0);
    (student as any).uniformBalance = parseFloat((currentUniformBalance + totalAmount).toFixed(2));
    await studentRepository.save(student);

    res.status(201).json({
      message: 'Uniform charge created successfully',
      charge: {
        id: savedCharge.id,
        studentId: student.id,
        amount: savedCharge.amount,
        description: savedCharge.description,
        items: chargeItems,
        uniformBalance: (student as any).uniformBalance
      }
    });
  } catch (error: any) {
    console.error('Error creating uniform charge:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

const UNIFORM_PAYMENT_METHODS = ['Cash(USD)', 'Ecocash(USD)', 'Bank Transfer(USD)'] as const;

/** Generate next REC + 7-digit receipt number for uniform payments. */
async function getNextUniformReceiptNumber(repository: any): Promise<string> {
  const recPrefix = 'REC';
  const qb = repository
    .createQueryBuilder('log')
    .select('log.receiptNumber', 'receiptNumber')
    .where('log.receiptNumber LIKE :prefix', { prefix: `${recPrefix}%` })
    .orderBy('log.receiptNumber', 'DESC')
    .limit(1);
  const row = await qb.getRawOne();
  const rn = row?.receiptNumber;
  let nextNum = 1;
  if (rn && typeof rn === 'string' && rn.startsWith(recPrefix)) {
    const numPart = parseInt(rn.slice(recPrefix.length), 10);
    if (!isNaN(numPart)) nextNum = numPart + 1;
  }
  return recPrefix + String(nextNum).padStart(7, '0');
}

/** GET next uniform receipt number (for display on form before submit). */
export const getNextUniformReceiptNumberController = async (_req: Request, res: Response) => {
  try {
    const uniformPaymentLogRepository = AppDataSource.getRepository(UniformPaymentLog);
    const receiptNumber = await getNextUniformReceiptNumber(uniformPaymentLogRepository);
    res.json({ receiptNumber });
  } catch (error: any) {
    console.error('Error getting next uniform receipt number:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Record a uniform payment (separate from tuition). Decreases Student.uniformBalance. */
export const recordUniformPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, amount, paymentDate, paymentMethod, receiptNumber: bodyReceiptNumber, notes } = req.body;
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformPaymentLogRepository = AppDataSource.getRepository(UniformPaymentLog);

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }
    const amountNum = parseFloat(String(amount || 0));
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: 'A positive payment amount is required' });
    }

    const methodStr = paymentMethod ? String(paymentMethod).trim() : '';
    if (!UNIFORM_PAYMENT_METHODS.includes(methodStr as any)) {
      return res.status(400).json({
        message: `Payment method must be one of: ${UNIFORM_PAYMENT_METHODS.join(', ')}`
      });
    }

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let receiptNumber: string;
    const requested = bodyReceiptNumber ? String(bodyReceiptNumber).trim() : '';
    if (requested && /^REC\d{7}$/.test(requested)) {
      const existing = await uniformPaymentLogRepository.findOne({ where: { receiptNumber: requested } });
      receiptNumber = existing ? await getNextUniformReceiptNumber(uniformPaymentLogRepository) : requested;
    } else {
      receiptNumber = await getNextUniformReceiptNumber(uniformPaymentLogRepository);
    }

    const currentUniformBalance = parseAmount((student as any).uniformBalance ?? 0);
    const newBalance = Math.max(0, parseFloat((currentUniformBalance - amountNum).toFixed(2)));

    (student as any).uniformBalance = newBalance;
    await studentRepository.save(student);

    const log = uniformPaymentLogRepository.create({
      studentId: student.id,
      amountPaid: amountNum,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: methodStr,
      receiptNumber,
      notes: notes || null
    });
    await uniformPaymentLogRepository.save(log);

    res.json({
      message: 'Uniform payment recorded successfully',
      uniformBalance: newBalance,
      receiptNumber,
      payment: { id: log.id, amountPaid: amountNum, paymentDate: log.paymentDate, receiptNumber }
    });
  } catch (error: any) {
    console.error('Error recording uniform payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Generate PDF receipt for a uniform payment (by payment log id). */
export const generateUniformReceiptPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const uniformPaymentLogRepository = AppDataSource.getRepository(UniformPaymentLog);
    const uniformChargeRepository = AppDataSource.getRepository(UniformCharge);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const log = await uniformPaymentLogRepository.findOne({
      where: { id },
      relations: []
    });
    if (!log) {
      return res.status(404).json({ message: 'Uniform payment record not found' });
    }

    const student = await studentRepository.findOne({
      where: { id: log.studentId },
      relations: ['classEntity']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const uniformBalanceAfter = Math.max(0, parseFloat(parseAmount((student as any).uniformBalance ?? 0).toFixed(2)));

    const charges = await uniformChargeRepository.find({
      where: { studentId: student.id },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 20
    });
    const chargeItems: { itemName: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
    for (const charge of charges) {
      const items = (charge as any).items || [];
      for (const it of items) {
        chargeItems.push({
          itemName: it.itemName || '',
          quantity: Number(it.quantity ?? 0),
          unitPrice: parseFloat(String(it.unitPrice ?? 0)),
          lineTotal: parseFloat(String(it.lineTotal ?? 0))
        });
      }
    }

    const pdfBuffer = await createUniformReceiptPDF({
      student,
      settings,
      receiptNumber: log.receiptNumber || '',
      paymentAmount: parseFloat(String(log.amountPaid)),
      paymentDate: log.paymentDate,
      paymentMethod: log.paymentMethod || '',
      notes: log.notes,
      uniformBalanceAfter,
      chargeItems
    });

    const sanitizedName = (student.firstName + '-' + student.lastName).replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=uniform-receipt-${log.receiptNumber || log.id}-${sanitizedName}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating uniform receipt PDF:', error);
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

/** Cash receipts: payments for the term (optional date filter). Transport/DH cash uses invoice fee lines + proportional split. Pagination default 100; all=1 returns full list (cap 25k). */
export const getCashReceipts = async (req: AuthRequest, res: Response) => {
  try {
    const {
      term: termParam,
      feeType: feeTypeParam,
      page: pageParam,
      limit: limitParam,
      startDate: startDateParam,
      endDate: endDateParam,
      all: allParam
    } = req.query as { term?: string; feeType?: string; page?: string; limit?: string; startDate?: string; endDate?: string; all?: string };
    const fetchAll =
      String(allParam || '')
        .toLowerCase()
        .trim() === '1' ||
      String(allParam || '')
        .toLowerCase()
        .trim() === 'true';
    const settingsRepository = AppDataSource.getRepository(Settings);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = (settings as any)?.activeTerm || (settings as any)?.currentTerm || null;
    const termToUse = (termParam && String(termParam).trim()) || activeTerm || `Term 1 ${new Date().getFullYear()}`;
    const feeType = (feeTypeParam && String(feeTypeParam).toLowerCase()) || 'all';
    const validFeeTypes = ['all', 'tuition', 'dh', 'transport'];
    const filterFeeType = validFeeTypes.includes(feeType) ? feeType : 'all';

    const targetSettings = await settingsRepository.findOne({
      where: [{ activeTerm: termToUse }, { currentTerm: termToUse }],
      order: { createdAt: 'DESC' }
    });
    const rangeStart = targetSettings?.termStartDate || null;
    const rangeEnd = targetSettings?.termEndDate || null;

    // Use term match only (same as invoice list) so Total Invoiced syncs with Total Invoice Amount
    const invoiceScopeQb = invoiceRepository
      .createQueryBuilder('iv')
      .select('iv.id', 'id')
      .where('COALESCE(iv.isVoided, false) = false')
      .andWhere('LOWER(TRIM(COALESCE(iv.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });

    const qb = paymentLogRepository
      .createQueryBuilder('log')
      .innerJoinAndSelect('log.invoice', 'invoice')
      .leftJoinAndSelect('log.student', 'student')
      .andWhere('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
      .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')")
      .andWhere(`log.invoiceId IN (${invoiceScopeQb.getQuery()})`)
      .setParameters(invoiceScopeQb.getParameters());

    const dateFrom = startDateParam && String(startDateParam).trim() ? new Date(String(startDateParam).trim()) : null;
    let dateTo: Date | null = endDateParam && String(endDateParam).trim() ? new Date(String(endDateParam).trim()) : null;
    if (dateTo && !isNaN(dateTo.getTime())) {
      dateTo.setHours(23, 59, 59, 999); // include full end date
    }
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      qb.andWhere('log.paymentDate >= :dateFrom', { dateFrom });
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      qb.andWhere('log.paymentDate <= :dateTo', { dateTo });
    }
    qb.orderBy('log.paymentDate', 'DESC').addOrderBy('log.createdAt', 'DESC');

    const logsEntities = await qb.getMany();
    const feesCfg: any = (settings as any)?.feesSettings || {};
    const diningHallCost = Math.round(parseFloat(String(feesCfg.diningHallCost ?? 0)) || 0);
    const transportCost = Math.round(parseFloat(String(feesCfg.transportCost ?? 0)) || 0);
    const allLogs = logsEntities.map((log: any) => {
      const inv = log.invoice || {};
      const stu = log.student || {};
      const desc = String(inv.description || '');
      return {
        id: log.id,
        amountPaid: parseFloat(String(log.amountPaid ?? 0)),
        paymentDate: log.paymentDate,
        paymentMethod: log.paymentMethod,
        receiptNumber: log.receiptNumber,
        createdAt: log.createdAt,
        invoiceNumber: inv.invoiceNumber || '',
        invoiceTerm: inv.term || '',
        invoiceAmount: parseFloat(String(inv.amount ?? 0)) || 0,
        invoiceDescription: desc,
        invTuitionAmount: parseFloat(String(inv.tuitionAmount ?? 0)) || 0,
        invTransportAmount: parseFloat(String(inv.transportAmount ?? 0)) || 0,
        invDiningHallAmount: parseFloat(String(inv.diningHallAmount ?? 0)) || 0,
        invRegistrationAmount: parseFloat(String(inv.registrationAmount ?? 0)) || 0,
        invDeskFeeAmount: parseFloat(String(inv.deskFeeAmount ?? 0)) || 0,
        studentId: String(stu.id || log.studentId || ''),
        studentType: String(stu.studentType || ''),
        usesTransport: !!stu.usesTransport,
        usesDiningHall: !!stu.usesDiningHall,
        isStaffChild: !!stu.isStaffChild,
        isExempted: !!stu.isExempted,
        studentName: [stu.firstName, stu.lastName].filter(Boolean).join(' ').trim() || 'N/A',
        studentNumber: stu.studentNumber || ''
      };
    });

    /**
     * Split each payment across invoice fee lines by proportion of the current invoice amount.
     * Transport share only if day scholar + uses school transport (+ staff/exempt rules); DH only if not boarder + uses DH.
     * Uses invoice transportAmount / diningHallAmount; if a line is missing but the student is eligible, falls back to settings rate.
     */
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const COMP_EPS = 0.005;
    const allocateTransportDhFromInvoice = (
      payment: number,
      l: {
        invoiceAmount: number;
        invTuitionAmount: number;
        invTransportAmount: number;
        invDiningHallAmount: number;
        invRegistrationAmount: number;
        invDeskFeeAmount: number;
        studentType: string;
        usesTransport: boolean;
        usesDiningHall: boolean;
        isStaffChild: boolean;
        isExempted: boolean;
      }
    ) => {
      const invAmt = Math.max(0, l.invoiceAmount || 0);
      const invTu = Math.max(0, l.invTuitionAmount || 0);
      const invTrRaw = Math.max(0, l.invTransportAmount || 0);
      const invDhRaw = Math.max(0, l.invDiningHallAmount || 0);
      const invReg = Math.max(0, l.invRegistrationAmount || 0);
      const invDesk = Math.max(0, l.invDeskFeeAmount || 0);

      const st = String(l.studentType || '').trim().toLowerCase();
      const transportEligible =
        st === 'day scholar' && l.usesTransport && !l.isStaffChild && !l.isExempted && transportCost > 0;
      const dhEligible = st !== 'boarder' && l.usesDiningHall && diningHallCost > 0;

      const compSum = invTu + invTrRaw + invDhRaw + invReg + invDesk;
      const otherGap = Math.max(0, invAmt - compSum);
      let wTu = invTu + invReg + invDesk + otherGap;

      let wTr = 0;
      if (transportEligible) {
        wTr = invTrRaw > COMP_EPS ? invTrRaw : transportCost;
      }
      let wDh = 0;
      if (dhEligible) {
        const dhSynth = l.isStaffChild || l.isExempted ? Math.round(diningHallCost * 0.5) : diningHallCost;
        wDh = invDhRaw > COMP_EPS ? invDhRaw : dhSynth;
      }

      let S = wTu + wTr + wDh;
      if (S <= 0 && invAmt > 0) {
        wTu = invAmt;
        S = invAmt;
      }
      if (invAmt > 0 && S > invAmt + 0.02) {
        const f = invAmt / S;
        wTu *= f;
        wTr *= f;
        wDh *= f;
        S = invAmt;
      }
      const denom = S > 0 ? S : invAmt > 0 ? invAmt : 1;
      const transportPortion =
        transportEligible && wTr > COMP_EPS ? round2((payment * wTr) / denom) : 0;
      const dhPortion = dhEligible && wDh > COMP_EPS ? round2((payment * wDh) / denom) : 0;
      const tuitionPortion = round2(Math.max(0, payment - transportPortion - dhPortion));
      const tuitionWithOverpayment = Math.max(0, tuitionPortion);
      return { transportPortion, dhPortion, tuitionWithOverpayment };
    };

    // Tuition / "all": same proportional split; transport & DH tabs show invoice-attributed portions per payment line.
    let totalRawPayments = 0;
    let totalTransportSum = 0;
    let totalDHSum = 0;
    let totalTuitionSum = 0;

    /** Invoice-proportional cash attributed to transport/DH; summed over all payment lines in term/date scope. */
    let summaryAllTransportTotal = 0;
    let summaryAllDHTotal = 0;
    let summaryTransportLineCount = 0;
    let summaryDHLineCount = 0;
    const PORTION_LINE_EPS = 0.005;

    type StudentReceiptAgg = { studentId: string; studentNumber: string; studentName: string; total: number };
    const transportReceiptsByStudent = new Map<string, StudentReceiptAgg>();
    const dhReceiptsByStudent = new Map<string, StudentReceiptAgg>();

    const allocatedItems = allLogs.map((l: any) => {
      const payment = parseFloat(String(l.amountPaid ?? 0)) || 0;
      const { transportPortion, dhPortion, tuitionWithOverpayment } = allocateTransportDhFromInvoice(payment, l);

      summaryAllTransportTotal += transportPortion;
      summaryAllDHTotal += dhPortion;
      if (transportPortion > PORTION_LINE_EPS) summaryTransportLineCount += 1;
      if (dhPortion > PORTION_LINE_EPS) summaryDHLineCount += 1;

      const sid = String(l.studentId || '').trim();
      if (sid && transportPortion > PORTION_LINE_EPS) {
        const cur =
          transportReceiptsByStudent.get(sid) || {
            studentId: sid,
            studentNumber: l.studentNumber || '',
            studentName: l.studentName || 'N/A',
            total: 0
          };
        cur.total += transportPortion;
        transportReceiptsByStudent.set(sid, cur);
      }
      if (sid && dhPortion > PORTION_LINE_EPS) {
        const cur =
          dhReceiptsByStudent.get(sid) || {
            studentId: sid,
            studentNumber: l.studentNumber || '',
            studentName: l.studentName || 'N/A',
            total: 0
          };
        cur.total += dhPortion;
        dhReceiptsByStudent.set(sid, cur);
      }

      totalRawPayments += payment;

      let allocated = payment;
      if (filterFeeType === 'transport') {
        allocated = transportPortion;
        totalTransportSum += transportPortion;
      } else if (filterFeeType === 'dh') {
        allocated = dhPortion;
        totalDHSum += dhPortion;
      } else if (filterFeeType === 'tuition') {
        allocated = tuitionWithOverpayment;
        totalTuitionSum += tuitionWithOverpayment;
        totalTransportSum += transportPortion;
        totalDHSum += dhPortion;
      } else {
        allocated = payment;
        totalTuitionSum += tuitionWithOverpayment;
        totalTransportSum += transportPortion;
        totalDHSum += dhPortion;
      }

      return {
        ...l,
        rawAmountPaid: payment,
        amountPaid: allocated,
        tuitionAmount: Math.round(tuitionWithOverpayment * 100) / 100,
        transportAmount: Math.round(transportPortion * 100) / 100,
        dhAmount: Math.round(dhPortion * 100) / 100
      };
    });

    const logisticsTransportReceiptsByStudent = [...transportReceiptsByStudent.values()]
      .map((r) => ({
        studentId: r.studentId,
        studentNumber: r.studentNumber,
        studentName: r.studentName,
        totalAttributed: Math.round(r.total)
      }))
      .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), undefined, { sensitivity: 'base' }));

    const logisticsDHReceiptsByStudent = [...dhReceiptsByStudent.values()]
      .map((r) => ({
        studentId: r.studentId,
        studentNumber: r.studentNumber,
        studentName: r.studentName,
        totalAttributed: Math.round(r.total)
      }))
      .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), undefined, { sensitivity: 'base' }));

    const rawTuitionTotal = Math.round(totalTuitionSum * 100) / 100;
    const rawDHTotal = Math.round(totalDHSum * 100) / 100;
    const rawTransportTotal = Math.round(totalTransportSum * 100) / 100;

    // Whole dollars only: proportional line amounts are cents; published totals must be integers.
    summaryAllTransportTotal = Math.round(summaryAllTransportTotal);
    summaryAllDHTotal = Math.round(summaryAllDHTotal);

    // Pagination: default 100 per page, max 100; all=1 returns full list (capped)
    const CASH_RECEIPTS_DEFAULT_LIMIT = 100;
    const CASH_RECEIPTS_MAX_LIMIT = 100;
    const CASH_RECEIPTS_ALL_MAX = 25000;
    const totalItemCount = allocatedItems.filter((l: any) => (l.rawAmountPaid || 0) > 0).length;
    const allItems = allocatedItems.filter((l: any) => (l.rawAmountPaid || 0) > 0);

    let page: number;
    let limit: number;
    let totalPages: number;
    let items: typeof allItems;
    let cashLogisticsAllTruncated = false;

    if (fetchAll) {
      page = 1;
      if (allItems.length > CASH_RECEIPTS_ALL_MAX) {
        items = allItems.slice(0, CASH_RECEIPTS_ALL_MAX);
        limit = items.length;
        cashLogisticsAllTruncated = true;
      } else {
        items = allItems;
        limit = items.length;
      }
      totalPages = 1;
    } else {
      page = Math.max(1, parseInt(String(pageParam || ''), 10) || 1);
      const limitRaw = parseInt(String(limitParam || ''), 10);
      limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : CASH_RECEIPTS_DEFAULT_LIMIT, 1), CASH_RECEIPTS_MAX_LIMIT);
      const skip = (page - 1) * limit;
      totalPages = Math.max(1, Math.ceil(totalItemCount / limit));
      items = allItems.slice(skip, skip + limit);
    }

    // Use term match only (same as invoice list) so Total Invoiced syncs with Total Invoice Amount
    const invoicesScopeForTotalsQb = invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('COALESCE(invoice.isVoided, false) = false')
      .andWhere('LOWER(TRIM(COALESCE(invoice.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });
    const invoicesForTotals = await invoicesScopeForTotalsQb.getMany();

    // Term-wide transport / DH totals for logistics KPIs: prefer sum of invoice line items; if zero, use eligible students × settings (matches enrolment counts).
    let sumInvoiceTransport = 0;
    let sumInvoiceDH = 0;
    const transportEligibleStudentIds = new Set<string>();
    const dhPerStudent = new Map<string, number>();
    for (const iv of invoicesForTotals || []) {
      const st = (iv as any).student;
      sumInvoiceTransport += parseFloat(String((iv as any).transportAmount ?? 0)) || 0;
      sumInvoiceDH += parseFloat(String((iv as any).diningHallAmount ?? 0)) || 0;
      const stType = String(st?.studentType || '').trim().toLowerCase();
      if (st && stType === 'day scholar' && st.usesTransport && !st.isStaffChild && !st.isExempted && transportCost > 0) {
        transportEligibleStudentIds.add(iv.studentId);
      }
      if (st && stType !== 'boarder' && st.usesDiningHall && diningHallCost > 0) {
        const dhOne = st.isStaffChild || st.isExempted ? Math.round(diningHallCost * 0.5) : diningHallCost;
        if (!dhPerStudent.has(iv.studentId)) dhPerStudent.set(iv.studentId, dhOne);
      }
    }
    let cohortDHFromSettings = 0;
    dhPerStudent.forEach(v => {
      cohortDHFromSettings += v;
    });
    const cohortTransportFromSettings = transportEligibleStudentIds.size * transportCost;
    const logisticsTermTransportTotal =
      sumInvoiceTransport > 0.005 ? Math.round(sumInvoiceTransport * 100) / 100 : Math.round(cohortTransportFromSettings * 100) / 100;
    const logisticsTermDHTotal =
      sumInvoiceDH > 0.005 ? Math.round(sumInvoiceDH * 100) / 100 : Math.round(cohortDHFromSettings * 100) / 100;
    const logisticsTransportEligibleCount = transportEligibleStudentIds.size;
    const logisticsDHEligibleCount = dhPerStudent.size;

    /**
     * Outstanding transport / DH per invoice: apply paidAmount sequentially to
     * previous balance → tuition & other line items → transport → dining hall.
     * Remaining in each logistics bucket is what's still owed on that fee (full $120 / $180 / $90
     * when payment never reaches that bucket), not a % of total balance.
     */
    const UNPAID_EPS = 0.02;
    let logisticsTransportUnpaidCount = 0;
    let logisticsDHUnpaidCount = 0;
    let logisticsTransportUnpaidAmount = 0;
    let logisticsDHUnpaidAmount = 0;
    for (const iv of invoicesForTotals || []) {
      const st = (iv as any).student;
      if (!st) continue;
      const bal = Math.max(0, parseFloat(String((iv as any).balance || 0)) || 0);
      if (bal <= UNPAID_EPS) continue;

      const paid = Math.max(0, parseFloat(String((iv as any).paidAmount || 0)) || 0);
      const stType = String(st.studentType || '').trim().toLowerCase();
      const prev = Math.max(0, parseFloat(String((iv as any).previousBalance || 0)) || 0);
      const amt = parseFloat(String((iv as any).amount || 0)) || 0;

      const t0 = parseFloat(String((iv as any).tuitionAmount || 0)) || 0;
      let tr = parseFloat(String((iv as any).transportAmount || 0)) || 0;
      let dh = parseFloat(String((iv as any).diningHallAmount || 0)) || 0;
      const reg = parseFloat(String((iv as any).registrationAmount || 0)) || 0;
      const desk = parseFloat(String((iv as any).deskFeeAmount || 0)) || 0;

      const trEligible =
        stType === 'day scholar' && st.usesTransport && !st.isStaffChild && !st.isExempted && transportCost > 0;
      const dhEligible = stType !== 'boarder' && st.usesDiningHall && diningHallCost > 0;
      if (trEligible && tr < 0.005) tr = transportCost;
      if (dhEligible && dh < 0.005) {
        dh = st.isStaffChild || st.isExempted ? Math.round(diningHallCost * 0.5) : diningHallCost;
      }

      const compSum = t0 + tr + dh + reg + desk;
      const otherGap = Math.max(0, amt - compSum);
      const bTuition = t0 + otherGap + reg + desk;
      const bTr = tr;
      const bDh = dh;

      let pool = paid;
      const payPrev = Math.min(pool, prev);
      pool -= payPrev;
      const payTu = Math.min(pool, bTuition);
      pool -= payTu;
      const payTr = Math.min(pool, bTr);
      pool -= payTr;
      const payDh = Math.min(pool, bDh);

      const unpaidTr = Math.round((bTr - payTr) * 100) / 100;
      const unpaidDh = Math.round((bDh - payDh) * 100) / 100;

      if (bTr > 0.005 && unpaidTr > UNPAID_EPS) {
        logisticsTransportUnpaidCount += 1;
        logisticsTransportUnpaidAmount += unpaidTr;
      }
      if (bDh > 0.005 && unpaidDh > UNPAID_EPS) {
        logisticsDHUnpaidCount += 1;
        logisticsDHUnpaidAmount += unpaidDh;
      }
    }
    logisticsTransportUnpaidAmount = Math.round(logisticsTransportUnpaidAmount * 100) / 100;
    logisticsDHUnpaidAmount = Math.round(logisticsDHUnpaidAmount * 100) / 100;

    // Total invoiced (net) for reconciliation = sum(amount + previousBalance - prepaidAmount).
    // This matches the canonical invoice identity:
    // paidAmount + balance = amount + previousBalance - prepaidAmount
    const totalInvoiced = Math.round(
      (invoicesForTotals || []).reduce(
        (s, iv: any) =>
          s +
          (parseFloat(String(iv.amount || 0)) || 0) +
          (parseFloat(String(iv.previousBalance || 0)) || 0) -
          (parseFloat(String(iv.prepaidAmount || 0)) || 0),
        0
      ) * 100
    ) / 100;

    const totalInvoicedGross = Math.round(
      (invoicesForTotals || []).reduce(
        (s, iv: any) =>
          s +
          (parseFloat(String(iv.amount || 0)) || 0) +
          (parseFloat(String(iv.previousBalance || 0)) || 0),
        0
      ) * 100
    ) / 100;

    const totalPrepaidInTerm = Math.round(
      (invoicesForTotals || []).reduce((s, iv: any) => s + (parseFloat(String(iv.prepaidAmount || 0)) || 0), 0) * 100
    ) / 100;

    const invoicesCount = invoicesForTotals.length;
    const uniqueStudentsWithInvoices = new Set((invoicesForTotals || []).map(iv => iv.studentId));
    const studentsWithInvoices = uniqueStudentsWithInvoices.size;
    let studentsFullyPaid = 0;
    let studentsPartiallyPaid = 0;
    let studentsUnpaid = 0;
    const latestByStudent: Record<string, { paid: number; balance: number }> = {};
    for (const iv of invoicesForTotals) {
      const paid = parseFloat(String((iv as any).paidAmount || 0)) || 0;
      const bal = parseFloat(String((iv as any).balance || 0)) || 0;
      const key = iv.studentId;
      const prev = latestByStudent[key] || { paid: 0, balance: 0 };
      latestByStudent[key] = { paid: prev.paid + paid, balance: prev.balance + bal };
    }
    Object.values(latestByStudent).forEach(v => {
      if (v.paid > 0 && v.balance <= 0) studentsFullyPaid++;
      else if (v.paid > 0 && v.balance > 0) studentsPartiallyPaid++;
      else studentsUnpaid++;
    });

    const distinctTermsQb = invoiceRepository
      .createQueryBuilder('invoice')
      .select('DISTINCT invoice.term', 'term')
      .where('invoice.term IS NOT NULL AND invoice.term != :empty', { empty: '' })
      .orderBy('invoice.term', 'DESC');
    const termsResult = await distinctTermsQb.getRawMany();
    let availableTerms = (termsResult || []).map((r: any) => r.term).filter(Boolean);
    if (activeTerm && !availableTerms.includes(activeTerm)) {
      availableTerms = [activeTerm, ...availableTerms];
    }

    const outstandingQb = invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(CAST(COALESCE(invoice.balance, 0) AS numeric)), 0)', 'total')
      .andWhere('COALESCE(invoice.isVoided, false) = false')
      .andWhere('LOWER(TRIM(COALESCE(invoice.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });
    const outstandingRaw = await outstandingQb.getRawOne<Record<string, string>>();
    const totalOutstanding = Math.round((parseFloat(String(outstandingRaw?.total ?? 0)) || 0) * 100) / 100;

    // Sum of invoice.paidAmount for term invoices - ensures totalPaidFromInvoices + totalOutstanding = totalInvoiced
    const totalPaidFromInvoices = Math.round(
      (invoicesForTotals || []).reduce((s, iv: any) => s + (parseFloat(String(iv.paidAmount || 0)) || 0), 0) * 100
    ) / 100;

    const totalCashReceived = Math.round(totalRawPayments * 100) / 100;

    // Totals by fee type are computed from actual payment logs (cash receipts), not from invoice.paidAmount.
    const totalTuitionCollected = rawTuitionTotal;
    const totalDHFeeCollected = rawDHTotal;
    const totalTransportFeeCollected = rawTransportTotal;
    const totalCollected =
      filterFeeType === 'all'
        ? totalCashReceived
        : filterFeeType === 'tuition'
          ? totalTuitionCollected
          : filterFeeType === 'transport'
            ? totalTransportFeeCollected
            : totalDHFeeCollected;

    res.json({
      term: termToUse,
      activeTerm: activeTerm || null,
      feeType: filterFeeType,
      totalPayments:
        filterFeeType === 'tuition'
          ? totalTuitionCollected
          : filterFeeType === 'transport'
            ? totalTransportFeeCollected
            : filterFeeType === 'dh'
              ? totalDHFeeCollected
              : totalCashReceived,
      totalCollected,
      totalCashReceived,
      totalPaidFromInvoices,
      totalInvoiced,
      invoicesCount,
      /** Tuition/all: proportional split. Transport/DH tabs: sums of settings flat fees per receipt line (not a % of payment). */
      totalTuitionCollected,
      totalDHFeeCollected,
      totalTransportFeeCollected,
      totalTuition: totalTuitionCollected,
      totalTransport: totalTransportFeeCollected,
      totalDH: totalDHFeeCollected,
      /** For feeType=all, matches total cash; for transport/dh, sum of flat fee lines (can differ from cash). */
      totalReceiptsSum: totalCashReceived,
      studentsWithInvoices,
      studentsFullyPaid,
      studentsPartiallyPaid,
      studentsUnpaid,
      totalOutstanding,
      count: totalItemCount,
      items,
      availableTerms,
      page,
      limit,
      total: totalItemCount,
      totalPages,
      /** Cash receipts attributed to transport/DH from invoice fee mix (proportional); term + optional date filters; whole dollars. */
      allRecordsTransportTotal: summaryAllTransportTotal,
      allRecordsDHTotal: summaryAllDHTotal,
      totalTransportReceipts: summaryAllTransportTotal,
      totalDHReceipts: summaryAllDHTotal,
      /** Payment lines with any transport / DH portion of cash (> $0.005). */
      allRecordsTransportLineCount: summaryTransportLineCount,
      allRecordsDHLineCount: summaryDHLineCount,
      /** Per-student sum of attributed cash (rounded dollars), sorted by name. */
      logisticsTransportReceiptsByStudent,
      logisticsDHReceiptsByStudent,
      cashLogisticsTruncated: cashLogisticsAllTruncated,
      cashLogisticsReturnedCount: items.length,
      /** Term totals for logistics KPIs: invoice transport/DH sums, or eligible students × settings if invoice lines are zero. */
      logisticsTermTransportTotal,
      logisticsTermDHTotal,
      logisticsTransportEligibleCount,
      logisticsDHEligibleCount,
      logisticsFromInvoiceTransport: Math.round(sumInvoiceTransport * 100) / 100,
      logisticsFromInvoiceDH: Math.round(sumInvoiceDH * 100) / 100,
      /** Per term invoice: unpaid transport/DH after applying paidAmount in order: prior balance → tuition & fees → transport → DH. */
      logisticsTransportUnpaidCount,
      logisticsDHUnpaidCount,
      logisticsTransportUnpaidAmount,
      logisticsDHUnpaidAmount
    });
  } catch (error: any) {
    console.error('Error fetching cash receipts:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getCashReceiptsPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { term: termParam } = req.query as { term?: string };
    const settingsRepository = AppDataSource.getRepository(Settings);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = (settings as any)?.activeTerm || (settings as any)?.currentTerm || null;
    const termToUse = (termParam && String(termParam).trim()) || activeTerm || `Term 1 ${new Date().getFullYear()}`;

    const targetSettings = await settingsRepository.findOne({
      where: [{ activeTerm: termToUse }, { currentTerm: termToUse }],
      order: { createdAt: 'DESC' }
    });
    const rangeStart = targetSettings?.termStartDate || null;
    const rangeEnd = targetSettings?.termEndDate || null;

    const qb = paymentLogRepository
      .createQueryBuilder('log')
      .innerJoinAndSelect('log.invoice', 'invoice')
      .leftJoinAndSelect('log.student', 'student')
      .andWhere('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
      .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')")
      .orderBy('log.paymentDate', 'DESC')
      .addOrderBy('log.createdAt', 'DESC');

    if (rangeStart && rangeEnd) {
      qb.andWhere('log.paymentDate >= :startDate', { startDate: rangeStart })
        .andWhere('log.paymentDate <= :endDate', { endDate: rangeEnd });
    } else {
      qb.andWhere('LOWER(TRIM(COALESCE(invoice.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });
    }

    const logsEntities = await qb.getMany();
    const rows = logsEntities.map((log: any) => {
      const inv = log.invoice || {};
      const stu = log.student || {};
      return {
        paymentDate: log.paymentDate,
        receiptNumber: log.receiptNumber,
        invoiceNumber: inv.invoiceNumber || '',
        studentName: [stu.firstName, stu.lastName].filter(Boolean).join(' ').trim() || 'N/A',
        studentNumber: stu.studentNumber || '',
        amountPaid: parseFloat(String(log.amountPaid ?? 0))
      };
    });

    // Total cash received = direct sum of payment log entries (actual payments recorded).
    const totalCashReceived = rows.reduce((s, r) => s + r.amountPaid, 0);
    const schoolName = (settings?.schoolName != null && String(settings.schoolName).trim() !== '') ? String(settings.schoolName).trim() : 'School';
    const currencySymbol = (settings?.currencySymbol != null && String(settings.currencySymbol).trim() !== '') ? String(settings.currencySymbol).trim() : 'KES';
    const schoolLogo2 = (settings as any)?.schoolLogo2 ?? null;

    const pdfBuffer = await createCashReceiptsPDF({
      schoolName,
      currencySymbol,
      term: termToUse,
      reportDate: new Date(),
      totalCashReceived: Math.round(totalCashReceived * 100) / 100,
      rows,
      schoolLogo2: schoolLogo2 != null ? String(schoolLogo2).trim() : null
    });

    const filename = `Cash_Receipts_${termToUse.replace(/\s+/g, '_')}.pdf`;
    const disposition = (req.query as any).download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating cash receipts PDF:', error);
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

/** Reconcile a term's invoice outstanding vs latest-invoice outstanding and list discrepancies. */
export const reconcileTermOutstanding = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const { term: termParam } = req.query as { term?: string };
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
    const studentRepository = AppDataSource.getRepository(Student);

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = (settings as any)?.activeTerm || (settings as any)?.currentTerm || null;
    const termToUse = (termParam && String(termParam).trim()) || activeTerm || `Term 1 ${new Date().getFullYear()}`;

    const rangeStart = (await settingsRepository.findOne({ where: [{ activeTerm: termToUse }, { currentTerm: termToUse }], order: { createdAt: 'DESC' } }))?.termStartDate || null;
    const rangeEnd = (await settingsRepository.findOne({ where: [{ activeTerm: termToUse }, { currentTerm: termToUse }], order: { createdAt: 'DESC' } }))?.termEndDate || null;

    // In-scope invoices for the term
    const inScopeQb = invoiceRepository.createQueryBuilder('iv')
      .where('COALESCE(iv.isVoided, false) = false');
    if (rangeStart && rangeEnd) {
      inScopeQb.andWhere(
        new Brackets((q) => {
          q.where('iv.createdAt BETWEEN :startDate AND :endDate', { startDate: rangeStart, endDate: rangeEnd })
            .orWhere('LOWER(TRIM(COALESCE(iv.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });
        })
      );
    } else {
      inScopeQb.andWhere('LOWER(TRIM(COALESCE(iv.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse });
    }
    const inScopeInvoices = await inScopeQb.getMany();
    const inScopeByStudent = new Map<string, any[]>();
    for (const iv of inScopeInvoices) {
      const list = inScopeByStudent.get(iv.studentId) || [];
      list.push(iv);
      inScopeByStudent.set(iv.studentId, list);
    }

    // Latest invoice per student (global)
    const students = await studentRepository.find({ select: ['id', 'firstName', 'lastName', 'studentNumber'] });
    const studentById = new Map(
      (students as any[]).map((s: any) => [
        s.id,
        {
          studentNumber: s.studentNumber || '',
          studentName: [s.firstName, s.lastName].filter(Boolean).join(' ').trim() || 'N/A'
        }
      ])
    );
    const latestByStudent = new Map<string, any>();
    for (const s of students) {
      const latest = await invoiceRepository.findOne({
        where: { studentId: s.id, isVoided: false },
        order: { createdAt: 'DESC' }
      });
      if (latest) latestByStudent.set(s.id, latest);
    }

    // Totals
    const totalOutstandingTerm = Math.round(inScopeInvoices.reduce((sum, iv: any) => sum + (parseFloat(String(iv.balance || 0)) || 0), 0) * 100) / 100;
    const totalOutstandingLatest = Math.round(Array.from(latestByStudent.values()).reduce((sum, iv: any) => sum + (parseFloat(String(iv.balance || 0)) || 0), 0) * 100) / 100;

    // Discrepancies: earlier invoices with outstanding balance while a newer invoice already exists.
    const discrepancies = [];
    for (const [studentId, invoices] of inScopeByStudent.entries()) {
      const latest = latestByStudent.get(studentId);
      for (const iv of invoices) {
        const ivBalance = parseFloat(String(iv.balance || 0)) || 0;
        // A discrepancy exists whenever an in-scope invoice still has balance but is not the student's latest invoice.
        // Do not require strictly later createdAt; bulk-created invoices can share identical timestamps.
        if (latest && latest.id !== iv.id && ivBalance > 0) {
          const stu = studentById.get(studentId) || { studentNumber: '', studentName: 'N/A' };
          discrepancies.push({
            studentId,
            studentNumber: stu.studentNumber,
            studentName: stu.studentName,
            invoiceId: iv.id,
            invoiceNumber: iv.invoiceNumber,
            invoiceTerm: iv.term,
            invoiceCreatedAt: iv.createdAt,
            balance: ivBalance,
            isLatest: false,
            latestInvoiceId: latest?.id || null,
            latestInvoiceNumber: latest?.invoiceNumber || null,
            latestInvoiceTerm: latest?.term || null,
            latestBalance: latest ? (parseFloat(String(latest.balance || 0)) || 0) : null
          });
        }
      }
    }

    const discrepancyStudentsMap = new Map<string, any>();
    for (const d of discrepancies) {
      const prev = discrepancyStudentsMap.get(d.studentId) || {
        studentId: d.studentId,
        studentNumber: d.studentNumber,
        studentName: d.studentName,
        earlierOutstandingTotal: 0,
        earlierInvoicesCount: 0,
        latestInvoiceId: d.latestInvoiceId,
        latestInvoiceNumber: d.latestInvoiceNumber,
        latestInvoiceTerm: d.latestInvoiceTerm,
        latestBalance: d.latestBalance,
        earlierInvoices: [] as any[]
      };
      prev.earlierOutstandingTotal = Math.round((prev.earlierOutstandingTotal + (d.balance || 0)) * 100) / 100;
      prev.earlierInvoicesCount += 1;
      prev.earlierInvoices.push({
        invoiceId: d.invoiceId,
        invoiceNumber: d.invoiceNumber,
        invoiceTerm: d.invoiceTerm,
        invoiceCreatedAt: d.invoiceCreatedAt,
        balance: d.balance
      });
      discrepancyStudentsMap.set(d.studentId, prev);
    }
    const discrepancyStudents = Array.from(discrepancyStudentsMap.values())
      .sort((a, b) => (b.earlierOutstandingTotal || 0) - (a.earlierOutstandingTotal || 0));
    const difference = Math.round((totalOutstandingTerm - totalOutstandingLatest) * 100) / 100;

    // Payments sum for the term-scoped invoices (to cross-verify cash received)
    const logQb = paymentLogRepository.createQueryBuilder('log')
      .andWhere('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
      .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')");
    if (inScopeInvoices.length > 0) {
      const ids = inScopeInvoices.map(iv => iv.id);
      logQb.andWhere('log.invoiceId IN (:...ids)', { ids });
    } else {
      logQb.andWhere('1=0');
    }
    const logs = await logQb.getMany();
    const totalPaymentsForInScope = Math.round(logs.reduce((s, l) => s + (parseFloat(String((l as any).amountPaid || 0)) || 0), 0) * 100) / 100;

    res.json({
      term: termToUse,
      totalOutstandingTerm,
      totalOutstandingLatest,
      difference,
      totalPaymentsForInScope,
      counts: {
        inScopeInvoices: inScopeInvoices.length,
        studentsWithInScopeInvoices: inScopeByStudent.size,
        studentsTotal: students.length,
        discrepancies: discrepancyStudents.length
      },
      discrepancies: discrepancies.slice(0, 200), // invoice-level (capped)
      discrepancyStudents: discrepancyStudents.slice(0, 300) // student-level list
    });
  } catch (error: any) {
    console.error('Error reconciling term outstanding:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Audit invoices: find where paidAmount + balance != amount + previousBalance - prepaidAmount (identity violation). */
export const auditInvoiceReconciliation = async (req: AuthRequest, res: Response) => {
  try {
    const { term: termParam } = req.query as { term?: string };
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = (settings as any)?.activeTerm || (settings as any)?.currentTerm || null;
    const termToUse = (termParam && String(termParam).trim()) || activeTerm || `Term 1 ${new Date().getFullYear()}`;

    const invoices = await invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('COALESCE(invoice.isVoided, false) = false')
      .andWhere('LOWER(TRIM(COALESCE(invoice.term, \'\'))) = LOWER(TRIM(:term))', { term: termToUse })
      .orderBy('invoice.createdAt', 'DESC')
      .getMany();

    const ROUNDING_TOLERANCE = 0.01;
    const violations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      studentNumber: string | null;
      studentName: string | null;
      term: string | null;
      amount: number;
      previousBalance: number;
      prepaidAmount: number;
      paidAmount: number;
      balance: number;
      leftSide: number;   // paidAmount + balance
      rightSide: number;  // amount + previousBalance - prepaidAmount
      discrepancy: number;
    }> = [];

    let totalLeft = 0;
    let totalRight = 0;

    for (const inv of invoices) {
      const amount = parseFloat(String(inv.amount ?? 0)) || 0;
      const prev = parseFloat(String(inv.previousBalance ?? 0)) || 0;
      const prepaid = parseFloat(String(inv.prepaidAmount ?? 0)) || 0;
      const paid = parseFloat(String((inv as any).paidAmount ?? 0)) || 0;
      const bal = parseFloat(String((inv as any).balance ?? 0)) || 0;

      const leftSide = Math.round((paid + bal) * 100) / 100;
      const rightSide = Math.round((amount + prev - prepaid) * 100) / 100;
      const diff = Math.round((leftSide - rightSide) * 100) / 100;

      totalLeft += leftSide;
      totalRight += rightSide;

      if (Math.abs(diff) > ROUNDING_TOLERANCE) {
        const stu = (inv as any).student;
        violations.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          studentNumber: stu?.studentNumber ?? null,
          studentName: stu ? [stu.firstName, stu.lastName].filter(Boolean).join(' ').trim() || null : null,
          term: inv.term ?? null,
          amount,
          previousBalance: prev,
          prepaidAmount: prepaid,
          paidAmount: paid,
          balance: bal,
          leftSide,
          rightSide,
          discrepancy: diff
        });
      }
    }

    const totalDiscrepancy = Math.round((totalLeft - totalRight) * 100) / 100;

    res.json({
      term: termToUse,
      invoicesChecked: invoices.length,
      violationsCount: violations.length,
      totalLeft: Math.round(totalLeft * 100) / 100,
      totalRight: Math.round(totalRight * 100) / 100,
      totalDiscrepancy,
      identity: 'paidAmount + balance = amount + previousBalance - prepaidAmount',
      violations: violations.slice(0, 500)
    });
  } catch (error: any) {
    console.error('Error auditing invoice reconciliation:', error);
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

