import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PaymentLog } from '../entities/PaymentLog';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import {
  computeCanonicalInvoiceBalance,
  enforceInvoiceBalanceAfterNote,
  getConfiguredDeskFee,
  hydrateInvoiceLineItemsFromAmount,
  withDisplayBalance,
} from './invoiceFeesBalance';
import { recomputeInvoiceTotalsFromLineItems } from './studentLogisticsInvoice';

export const DEFAULT_REVERSAL_REASON =
  'Reversal of fictitious payment — invoice sync bug correction';

export const DEFAULT_CREDIT_NOTE_REASON =
  'Credit for duplicated tuition and fee charges — invoice sync bug correction';

export type RemediationPaymentRow = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: string | null;
  receiptNumber: string | null;
  notes: string | null;
  reversedAt: string | null;
  reversedByUserId: string | null;
  reversalPaymentLogId: string | null;
  reversesPaymentLogId: string | null;
  isReversalEntry: boolean;
  canReverse: boolean;
  reverseBlockedReason: string | null;
};

export type RemediationCreditItem =
  | 'tuition'
  | 'transport'
  | 'diningHall'
  | 'combined';

export type RemediationInvoiceRow = {
  id: string;
  invoiceNumber: string;
  term: string;
  tuitionAmount: number;
  transportAmount: number;
  diningHallAmount: number;
  registrationAmount: number;
  deskFeeAmount: number;
  paidAmount: number;
  balance: number;
  displayBalance: number;
  description: string | null;
};

const TERM_FEE_BUCKETS: Array<{ field: keyof Invoice; label: string }> = [
  { field: 'tuitionAmount', label: 'Tuition' },
  { field: 'diningHallAmount', label: 'Dining Hall' },
  { field: 'transportAmount', label: 'Transport' },
  { field: 'registrationAmount', label: 'Registration' },
  { field: 'deskFeeAmount', label: 'Desk Fee' },
];

function sumTermFeeLineItems(invoice: Invoice): number {
  return TERM_FEE_BUCKETS.reduce(
    (sum, bucket) => sum + parseAmount(invoice[bucket.field]),
    0
  );
}

function applyCombinedTermFeeCredit(
  invoice: Invoice,
  amount: number
): { appliedParts: string[]; remaining: number } {
  let remaining = parseAmount(amount);
  const appliedParts: string[] = [];

  for (const bucket of TERM_FEE_BUCKETS) {
    if (remaining <= 0.005) break;
    const current = parseAmount(invoice[bucket.field]);
    if (current <= 0.005) continue;
    const cut = Math.min(current, remaining);
    (invoice as any)[bucket.field] = parseFloat((current - cut).toFixed(2));
    remaining = parseFloat((remaining - cut).toFixed(2));
    appliedParts.push(`${bucket.label} -${cut.toFixed(2)}`);
  }

  return { appliedParts, remaining };
}

export type RemediationStudentPreview = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  className: string;
  totalOutstanding: number;
  payments: RemediationPaymentRow[];
  invoices: RemediationInvoiceRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStudentIdList(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const tokens: string[] = [];
  for (const part of parts) {
    String(part)
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => tokens.push(t));
  }
  return [...new Set(tokens)];
}

async function resolveStudents(tokens: string[]): Promise<Student[]> {
  if (!tokens.length) return [];
  const repo = AppDataSource.getRepository(Student);
  const uuids = tokens.filter((t) => UUID_RE.test(t));
  const numbers = tokens.filter((t) => !UUID_RE.test(t));

  const found: Student[] = [];
  if (uuids.length) {
    const byId = await repo.find({
      where: { id: In(uuids) },
      relations: ['classEntity'],
    });
    found.push(...byId);
  }
  if (numbers.length) {
    const byNum = await repo.find({
      where: { studentNumber: In(numbers) },
      relations: ['classEntity'],
    });
    found.push(...byNum);
  }

  const map = new Map<string, Student>();
  for (const s of found) map.set(s.id, s);
  return [...map.values()];
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function paymentCanReverse(log: PaymentLog): { ok: boolean; reason: string | null } {
  if (log.reversedAt || log.reversalPaymentLogId) {
    return { ok: false, reason: 'Already reversed' };
  }
  if (log.reversesPaymentLogId) {
    return { ok: false, reason: 'This is a reversal entry' };
  }
  const amt = parseAmount(log.amountPaid);
  if (amt <= 0.005) {
    return { ok: false, reason: 'Only positive payment amounts can be reversed' };
  }
  const method = String(log.paymentMethod || '').trim().toLowerCase();
  if (method === 'adjustment' || method === 'reversal') {
    return { ok: false, reason: 'Adjustments and reversals must not be reversed here' };
  }
  return { ok: true, reason: null };
}

export async function previewRemediationPayments(options: {
  studentIdsRaw: string | string[] | undefined;
  startDate?: string;
  endDate?: string;
}): Promise<{ students: RemediationStudentPreview[]; notFound: string[] }> {
  const tokens = parseStudentIdList(options.studentIdsRaw);
  if (!tokens.length) {
    throw new Error('At least one Student ID is required');
  }

  const students = await resolveStudents(tokens);
  const foundNumbers = new Set(students.map((s) => s.studentNumber.toLowerCase()));
  const foundIds = new Set(students.map((s) => s.id));
  const notFound = tokens.filter(
    (t) => !foundIds.has(t) && !foundNumbers.has(t.toLowerCase())
  );

  if (!students.length) {
    return { students: [], notFound: tokens };
  }

  const settings = await AppDataSource.getRepository(Settings).findOne({
    where: {},
    order: { createdAt: 'DESC' },
  });
  const deskFee = getConfiguredDeskFee(settings);

  const logRepo = AppDataSource.getRepository(PaymentLog);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const studentIds = students.map((s) => s.id);

  const qb = logRepo
    .createQueryBuilder('log')
    .leftJoinAndSelect('log.invoice', 'invoice')
    .where('log.studentId IN (:...studentIds)', { studentIds })
    .orderBy('log.paymentDate', 'DESC')
    .addOrderBy('log.createdAt', 'DESC');

  if (options.startDate) {
    qb.andWhere('log.paymentDate >= :startDate', { startDate: new Date(options.startDate) });
  }
  if (options.endDate) {
    qb.andWhere('log.paymentDate <= :endDate', { endDate: endOfDay(new Date(options.endDate)) });
  }

  const logs = await qb.getMany();

  const invoices = await invoiceRepo.find({
    where: { studentId: In(studentIds), isVoided: false },
    relations: ['student'],
    order: { createdAt: 'DESC' },
  });

  const invoicesByStudent = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const list = invoicesByStudent.get(inv.studentId) || [];
    list.push(inv);
    invoicesByStudent.set(inv.studentId, list);
  }

  const logsByStudent = new Map<string, PaymentLog[]>();
  for (const log of logs) {
    const list = logsByStudent.get(log.studentId) || [];
    list.push(log);
    logsByStudent.set(log.studentId, list);
  }

  const previews: RemediationStudentPreview[] = students.map((student) => {
    const studentInvoices = invoicesByStudent.get(student.id) || [];
    let totalOutstanding = 0;
    const invoiceRows: RemediationInvoiceRow[] = studentInvoices.map((inv) => {
      hydrateInvoiceLineItemsFromAmount(inv);
      const display = withDisplayBalance(inv, student, deskFee);
      const bal = computeCanonicalInvoiceBalance(inv);
      totalOutstanding += bal;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        term: inv.term,
        tuitionAmount: parseAmount(inv.tuitionAmount),
        transportAmount: parseAmount(inv.transportAmount),
        diningHallAmount: parseAmount(inv.diningHallAmount),
        registrationAmount: parseAmount(inv.registrationAmount),
        deskFeeAmount: parseAmount(inv.deskFeeAmount),
        paidAmount: parseAmount(inv.paidAmount),
        balance: parseAmount(inv.balance),
        displayBalance: parseAmount((display as any).balance ?? bal),
        description: inv.description,
      };
    });

    const studentLogs = logsByStudent.get(student.id) || [];
    const paymentRows: RemediationPaymentRow[] = studentLogs.map((log) => {
      const gate = paymentCanReverse(log);
      return {
        id: log.id,
        invoiceId: log.invoiceId,
        invoiceNumber: log.invoice?.invoiceNumber ?? null,
        paymentDate: log.paymentDate ? new Date(log.paymentDate).toISOString() : '',
        amountPaid: parseAmount(log.amountPaid),
        paymentMethod: log.paymentMethod,
        receiptNumber: log.receiptNumber,
        notes: log.notes,
        reversedAt: log.reversedAt ? new Date(log.reversedAt).toISOString() : null,
        reversedByUserId: log.reversedByUserId,
        reversalPaymentLogId: log.reversalPaymentLogId,
        reversesPaymentLogId: log.reversesPaymentLogId,
        isReversalEntry: !!log.reversesPaymentLogId || parseAmount(log.amountPaid) < -0.005,
        canReverse: gate.ok,
        reverseBlockedReason: gate.reason,
      };
    });

    return {
      id: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      className: (student as any).classEntity?.name || '',
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      payments: paymentRows,
      invoices: invoiceRows,
    };
  });

  return { students: previews, notFound };
}

async function assertNoExistingReversal(originalId: string): Promise<void> {
  const existing = await AppDataSource.getRepository(PaymentLog).findOne({
    where: { reversesPaymentLogId: originalId },
  });
  if (existing) {
    throw new Error(`Payment ${originalId} was already reversed (log ${existing.id})`);
  }
}

export async function reverseRemediationPayments(options: {
  paymentLogIds: string[];
  reason: string;
  performedByUserId: string | null;
  performedByName: string | null;
}): Promise<
  Array<{
    paymentLogId: string;
    original: PaymentLog;
    reversal: PaymentLog;
    invoice: Invoice;
    balanceBefore: number;
    balanceAfter: number;
  }>
> {
  const results: Array<{
    paymentLogId: string;
    original: PaymentLog;
    reversal: PaymentLog;
    invoice: Invoice;
    balanceBefore: number;
    balanceAfter: number;
  }> = [];

  for (const paymentLogId of options.paymentLogIds) {
    const row = await reverseRemediationPayment({
      paymentLogId,
      reason: options.reason,
      performedByUserId: options.performedByUserId,
      performedByName: options.performedByName,
    });
    results.push({ paymentLogId, ...row });
  }

  return results;
}

export async function reverseRemediationPayment(options: {
  paymentLogId: string;
  reason: string;
  performedByUserId: string | null;
  performedByName: string | null;
}): Promise<{
  original: PaymentLog;
  reversal: PaymentLog;
  invoice: Invoice;
  balanceBefore: number;
  balanceAfter: number;
}> {
  const { paymentLogId, reason, performedByUserId, performedByName } = options;
  const trimmedReason = String(reason || '').trim() || DEFAULT_REVERSAL_REASON;

  return AppDataSource.transaction(async (manager) => {
    const logRepo = manager.getRepository(PaymentLog);
    const invoiceRepo = manager.getRepository(Invoice);

    const original = await logRepo.findOne({
      where: { id: paymentLogId },
      relations: ['invoice', 'student'],
    });
    if (!original) {
      throw new Error('Payment log not found');
    }

    const gate = paymentCanReverse(original);
    if (!gate.ok) {
      throw new Error(gate.reason || 'Payment cannot be reversed');
    }

    await assertNoExistingReversal(original.id);

    const invoice = await invoiceRepo.findOne({
      where: { id: original.invoiceId },
      relations: ['student'],
    });
    if (!invoice) {
      throw new Error('Linked invoice not found');
    }
    if (invoice.isVoided) {
      throw new Error('Cannot reverse payment on a voided invoice');
    }

    hydrateInvoiceLineItemsFromAmount(invoice);
    const balanceBefore = computeCanonicalInvoiceBalance(invoice);

    const reversalAmount = parseAmount(original.amountPaid);
    let paid = parseAmount(invoice.paidAmount);
    let prepaid = parseAmount(invoice.prepaidAmount);

    if (paid >= reversalAmount - 0.005) {
      paid = parseFloat((paid - reversalAmount).toFixed(2));
    } else {
      const fromPaid = paid;
      paid = 0;
      const remainder = parseFloat((reversalAmount - fromPaid).toFixed(2));
      prepaid = Math.max(0, parseFloat((prepaid - remainder).toFixed(2)));
    }

    invoice.paidAmount = paid;
    invoice.prepaidAmount = prepaid;
    recomputeInvoiceTotalsFromLineItems(invoice);
    await invoiceRepo.save(invoice);

    const reversalLog = logRepo.create({
      invoiceId: invoice.id,
      studentId: original.studentId,
      amountPaid: -reversalAmount,
      paymentDate: new Date(),
      paymentMethod: 'REVERSAL',
      receiptNumber: null,
      payerUserId: performedByUserId,
      payerName: performedByName,
      notes: `PAYMENT REVERSAL of ${original.id}: ${trimmedReason}`,
      reversesPaymentLogId: original.id,
    });
    await logRepo.save(reversalLog);

    original.reversedAt = new Date();
    original.reversedByUserId = performedByUserId;
    original.reversalPaymentLogId = reversalLog.id;
    const origNotes = String(original.notes || '').trim();
    original.notes = origNotes
      ? `${origNotes}\n[REVERSED ${new Date().toISOString()} by ${performedByUserId || 'admin'} → ${reversalLog.id}]`
      : `[REVERSED ${new Date().toISOString()} by ${performedByUserId || 'admin'} → ${reversalLog.id}]`;
    await logRepo.save(original);

    const balanceAfter = computeCanonicalInvoiceBalance(invoice);

    return {
      original,
      reversal: reversalLog,
      invoice,
      balanceBefore,
      balanceAfter,
    };
  });
}

export async function applyRemediationCreditNote(options: {
  invoiceId: string;
  item: RemediationCreditItem;
  amount: number;
  reason: string;
  performedByUserId: string | null;
  performedByName: string | null;
}): Promise<{
  invoice: Invoice;
  balanceBefore: number;
  balanceAfter: number;
  noteText: string;
}> {
  const { invoiceId, item, performedByUserId, performedByName } = options;
  const amt = parseAmount(options.amount);
  const trimmedReason = String(options.reason || '').trim() || DEFAULT_CREDIT_NOTE_REASON;

  if (!amt || amt <= 0) {
    throw new Error('Amount is required and must be greater than 0');
  }
  if (!['tuition', 'transport', 'diningHall', 'combined'].includes(item)) {
    throw new Error('Invalid cost item. Must be tuition, transport, diningHall, or combined.');
  }

  return AppDataSource.transaction(async (manager) => {
    const invoiceRepo = manager.getRepository(Invoice);
    const studentRepo = manager.getRepository(Student);
    const logRepo = manager.getRepository(PaymentLog);

    const invoice = await invoiceRepo.findOne({
      where: { id: invoiceId },
      relations: ['student', 'student.classEntity'],
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (invoice.isVoided) {
      throw new Error('Cannot apply credit note to a voided invoice');
    }

    hydrateInvoiceLineItemsFromAmount(invoice);
    const balanceBefore = computeCanonicalInvoiceBalance(invoice);

    if (amt > balanceBefore + 0.005) {
      throw new Error(
        `Credit note cannot exceed the current balance (${balanceBefore.toFixed(2)}).`
      );
    }

    let noteText = '';
    const delta = -amt;

    if (item === 'combined') {
      const combinedBefore = sumTermFeeLineItems(invoice);
      if (amt > combinedBefore + 0.005) {
        throw new Error(
          `Combined credit cannot exceed term fee line items (${combinedBefore.toFixed(2)}).`
        );
      }

      const transportBefore = parseAmount(invoice.transportAmount);
      const diningBefore = parseAmount(invoice.diningHallAmount);
      const { appliedParts, remaining } = applyCombinedTermFeeCredit(invoice, amt);
      if (remaining > 0.005) {
        throw new Error('Could not apply the full combined credit amount to invoice line items.');
      }

      enforceInvoiceBalanceAfterNote(invoice, balanceBefore, delta);
      noteText = `Credit Note (${appliedParts.join(', ')}) [Remediation: ${trimmedReason}]`;

      let student = invoice.student;
      if (!student) {
        student = await studentRepo.findOne({ where: { id: invoice.studentId } });
      }
      if (student) {
        if (transportBefore > 0.005 && parseAmount(invoice.transportAmount) <= 0.005) {
          student.usesTransport = false;
        }
        if (diningBefore > 0.005 && parseAmount(invoice.diningHallAmount) <= 0.005) {
          student.usesDiningHall = false;
        }
        await studentRepo.save(student);
        invoice.student = student;
      }
    } else {
      const componentBefore =
        item === 'tuition'
          ? parseAmount(invoice.tuitionAmount)
          : item === 'transport'
            ? parseAmount(invoice.transportAmount)
            : parseAmount(invoice.diningHallAmount);

      if (amt > componentBefore + 0.005) {
        throw new Error(
          `Credit note for ${item} cannot exceed its current amount (${componentBefore.toFixed(2)}).`
        );
      }

      const componentAfter = parseFloat((componentBefore + delta).toFixed(2));

      if (item === 'tuition') {
        invoice.tuitionAmount = componentAfter;
      } else if (item === 'transport') {
        invoice.transportAmount = componentAfter;
      } else {
        invoice.diningHallAmount = componentAfter;
      }

      enforceInvoiceBalanceAfterNote(invoice, balanceBefore, delta);

      const itemLabel =
        item === 'tuition' ? 'Tuition' : item === 'transport' ? 'Transport Fee' : 'Dining Hall Fee';
      noteText = `Credit Note (${itemLabel} -${amt.toFixed(2)}) [Remediation: ${trimmedReason}]`;
    }

    if (invoice.description && String(invoice.description).trim() !== '') {
      invoice.description = `${invoice.description} | ${noteText}`;
    } else {
      invoice.description = noteText;
    }

    if (item !== 'combined') {
      let student = invoice.student;
      if (!student) {
        student = await studentRepo.findOne({ where: { id: invoice.studentId } });
      }
      if (student) {
        if (item === 'transport' && parseAmount(invoice.transportAmount) <= 0.005) {
          student.usesTransport = false;
        }
        if (item === 'diningHall' && parseAmount(invoice.diningHallAmount) <= 0.005) {
          student.usesDiningHall = false;
        }
        await studentRepo.save(student);
        invoice.student = student;
      }
    }

    await invoiceRepo.save(invoice);

    const adjustmentLog = logRepo.create({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      amountPaid: delta,
      paymentDate: new Date(),
      paymentMethod: 'ADJUSTMENT',
      receiptNumber: null,
      payerUserId: performedByUserId,
      payerName: performedByName,
      notes: noteText,
    });
    await logRepo.save(adjustmentLog);

    const balanceAfter = computeCanonicalInvoiceBalance(invoice);
    const settings = await manager.getRepository(Settings).findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    const deskFee = getConfiguredDeskFee(settings);
    const studentForDisplay =
      invoice.student ||
      (await studentRepo.findOne({ where: { id: invoice.studentId }, relations: ['classEntity'] }));
    const clientInvoice = withDisplayBalance(invoice, studentForDisplay ?? null, deskFee);

    return {
      invoice: clientInvoice,
      balanceBefore,
      balanceAfter,
      noteText,
    };
  });
}
