import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { PaymentLog } from '../entities/PaymentLog';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { Class } from '../entities/Class';
import { CashbookEntry, CashbookEntryType } from '../entities/CashbookEntry';
import { ParentStudent } from '../entities/ParentStudent';
import { Message } from '../entities/Message';
import {
  canonicalInvoiceTermFees,
  computeCanonicalInvoiceBalance,
  computeStudentTotalOutstanding,
  getConfiguredDeskFee,
  listStudentOutstandingInvoices,
} from './invoiceFeesBalance';
import { fetchOutstandingBalanceRows } from './outstandingBalances';
import { recomputeInvoiceTotalsFromLineItems } from './studentLogisticsInvoice';
import { parseAmount } from './numberUtils';
import { InvoiceStatus } from '../entities/Invoice';

const NOT_VOIDED = 'COALESCE(invoice.isVoided, false) = false';
const BUCKET_LABELS = ['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'] as const;

let cashbookTableReady = false;

/** Create cashbook_entries when migration has not been applied (dev-safe). */
async function ensureCashbookTable(): Promise<void> {
  if (cashbookTableReady) return;
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "cashbook_entries" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "entryDate" date NOT NULL,
      "type" character varying NOT NULL,
      "description" text NOT NULL,
      "moneyIn" numeric(10,2) NOT NULL DEFAULT 0,
      "moneyOut" numeric(10,2) NOT NULL DEFAULT 0,
      "paymentMethod" character varying,
      "reference" character varying,
      "source" character varying NOT NULL DEFAULT 'manual',
      "paymentLogId" character varying,
      "createdById" uuid,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cashbook_entries" PRIMARY KEY ("id")
    )
  `);
  await AppDataSource.query(
    `CREATE INDEX IF NOT EXISTS "IDX_cashbook_entries_entryDate" ON "cashbook_entries" ("entryDate", "createdAt")`
  );
  cashbookTableReady = true;
}

export type BalanceSheetSummary = {
  cashBalance: number;
  totalDebtors: number;
  monthlyCollections: number;
  debtorCount: number;
};

export type DebtorsAgingBucket = {
  bucket: string;
  count: number;
  amount: number;
};

export type ClassDebtSummaryRow = {
  id: string;
  name: string;
  formName: string | null;
  owed: number;
  studentsOwing: number;
};

export type RecentPaymentRow = {
  id: string;
  date: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  className: string | null;
  feeLabel: string;
  paymentMethod: string | null;
  amount: number;
  receiptNumber: string | null;
};

export type DebtorRow = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  amountOwed: number;
  oldestDueDate: string | null;
};

export type CashbookRow = {
  id: string;
  entryDate: string;
  type: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  paymentMethod: string | null;
  reference: string | null;
  source: string;
};

export type StudentStatementSummary = {
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
};

export type StudentStatementLedgerRow = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StudentStatementInvoiceRow = {
  id: string;
  invoiceNumber: string;
  description: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  dueDate: string;
  term: string;
};

export type StudentStatementPaymentRow = {
  id: string;
  reference: string | null;
  amount: number;
  label: string;
  method: string | null;
  date: string;
};

export type StudentStatementPayload = {
  student: {
    id: string;
    studentNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
  };
  summary: StudentStatementSummary;
  ledger: StudentStatementLedgerRow[];
  invoices: StudentStatementInvoiceRow[];
  payments: StudentStatementPaymentRow[];
};

function round2(n: number): number {
  return parseFloat((Number(n) || 0).toFixed(2));
}

/** Short fee category without student name (Overview recent payments). */
function deriveFeeCategoryLabel(
  inv: Invoice | null | undefined,
  stu: Student | null | undefined
): string {
  const desc = String(inv?.description || '').trim();
  const descLower = desc.toLowerCase();
  const regAmt = parseFloat(String(inv?.registrationAmount ?? 0)) || 0;
  const classEntity = (stu as Student & { classEntity?: { name?: string; form?: string } })?.classEntity;
  const className = String(classEntity?.name || classEntity?.form || '').trim();
  const studentType = String(stu?.studentType || '').trim();

  if (
    regAmt > 0.005 ||
    descLower.includes('registration') ||
    descLower.includes('initial fees upon registration')
  ) {
    const formFromDesc = desc.match(/Form\s*[\dA-Za-z\s]+/i)?.[0]?.trim();
    const formLabel =
      formFromDesc ||
      (className ? (className.match(/^Form\s/i) ? className : className) : null);
    return formLabel ? `New student registration — ${formLabel}` : 'New student registration';
  }

  if (
    descLower.includes('ordinary level') ||
    descLower.includes('o-level') ||
    descLower.includes('o level') ||
    /ordinary/i.test(studentType)
  ) {
    return 'Ordinary Level Tuition Fees';
  }
  if (
    descLower.includes('advanced level') ||
    descLower.includes('a-level') ||
    descLower.includes('a level') ||
    /advanced/i.test(studentType)
  ) {
    return 'Advanced Level Tuition Fees';
  }
  if (descLower.includes('primary') || /primary/i.test(studentType)) {
    return 'Primary Tuition Fees';
  }
  if (studentType && !/staff|exempt|new|returning/i.test(studentType)) {
    return `${studentType} Tuition Fees`;
  }

  const term = String(inv?.term || '').trim();
  if (term) return `Tuition Fees — ${term}`;

  if (desc) {
    const firstPart = desc.split('|')[0].split('\n')[0].trim();
    const dashIdx = firstPart.indexOf(' - ');
    let shortPart = (dashIdx > 0 ? firstPart.slice(0, dashIdx) : firstPart).trim();
    shortPart = shortPart
      .replace(/\s*\(Staff\/Exempted\)\s*$/i, '')
      .replace(/^Fees for\s+/i, '')
      .replace(/^Initial fees upon registration:?\s*/i, 'Registration fees')
      .trim();
    if (shortPart) return oneLineText(shortPart, 52);
  }

  return 'Fee payment';
}

/** One-line cashbook label: "Ordinary Level Tuition Fees - Jane Doe" */
function buildCashbookLineDescription(
  inv: Invoice | null | undefined,
  stu: Student | null | undefined
): string {
  const firstName = String(stu?.firstName || '').trim();
  const lastName = String(stu?.lastName || '').trim();
  const studentName = `${firstName} ${lastName}`.trim() || 'Student';
  const studentNumber = String(stu?.studentNumber || '').trim();
  const desc = String(inv?.description || '').trim();
  const descLower = desc.toLowerCase();
  const regAmt = parseFloat(String(inv?.registrationAmount ?? 0)) || 0;

  if (
    regAmt > 0.005 ||
    descLower.includes('registration') ||
    descLower.includes('initial fees upon registration')
  ) {
    const idPart = studentNumber ? ` (${studentNumber})` : '';
    return `${deriveFeeCategoryLabel(inv, stu)}${idPart} - ${studentName}`;
  }

  return `${deriveFeeCategoryLabel(inv, stu)} - ${studentName}`;
}

function oneLineText(text: string, maxLen = 80): string {
  const line = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1).trim()}…`;
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value) : new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function agingBucketForDueDate(dueDate: Date | string | null, balance: number): string {
  if (balance <= 0.005) return BUCKET_LABELS[0];
  const due = parseDateOnly(dueDate);
  if (!due) return BUCKET_LABELS[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOverdue <= 0) return BUCKET_LABELS[0];
  if (daysOverdue <= 30) return BUCKET_LABELS[1];
  if (daysOverdue <= 60) return BUCKET_LABELS[2];
  if (daysOverdue <= 90) return BUCKET_LABELS[3];
  return BUCKET_LABELS[4];
}

async function loadSettingsDeskFee(): Promise<number> {
  const settingsRepository = AppDataSource.getRepository(Settings);
  const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
  return getConfiguredDeskFee(settingsList[0] ?? null);
}

export async function fetchBalanceSheetSummary(): Promise<BalanceSheetSummary> {
  await ensureCashbookTable();
  const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
  const cashbookRepository = AppDataSource.getRepository(CashbookEntry);
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();

  const [paymentInSum, manualInSum, manualOutSum, monthlyRows, debtorRows] = await Promise.all([
    paymentLogRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(CAST(log.amountPaid AS numeric)), 0)', 'total')
      .where('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
      .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')")
      .getRawOne(),
    cashbookRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(CAST(e.moneyIn AS numeric)), 0)', 'total')
      .where("e.source = 'manual'")
      .getRawOne(),
    cashbookRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(CAST(e.moneyOut AS numeric)), 0)', 'total')
      .where("e.source = 'manual'")
      .getRawOne(),
    paymentLogRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(CAST(log.amountPaid AS numeric)), 0)', 'total')
      .where('log.paymentDate >= :monthStart', { monthStart })
      .andWhere('log.paymentDate <= :monthEnd', { monthEnd })
      .andWhere('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
      .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')")
      .getRawOne(),
    fetchDebtorRows(),
  ]);

  const cashBalance = round2(
    parseFloat(paymentInSum?.total || '0') +
      parseFloat(manualInSum?.total || '0') -
      parseFloat(manualOutSum?.total || '0')
  );
  const totalDebtors = round2(debtorRows.reduce((s, r) => s + r.amountOwed, 0));
  const monthlyCollections = round2(parseFloat(monthlyRows?.total || '0'));

  return {
    cashBalance,
    totalDebtors,
    monthlyCollections,
    debtorCount: debtorRows.length,
  };
}

export async function fetchDebtorsAging(): Promise<DebtorsAgingBucket[]> {
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const invoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .where(NOT_VOIDED)
    .getMany();

  const buckets = new Map<string, { count: number; amount: number }>();
  for (const label of BUCKET_LABELS) {
    buckets.set(label, { count: 0, amount: 0 });
  }

  for (const inv of invoices) {
    const balance = computeCanonicalInvoiceBalance(inv);
    if (balance <= 0.005) continue;
    const bucket = agingBucketForDueDate(inv.dueDate, balance);
    const entry = buckets.get(bucket)!;
    entry.count += 1;
    entry.amount = round2(entry.amount + balance);
  }

  return BUCKET_LABELS.map((bucket) => ({
    bucket,
    count: buckets.get(bucket)!.count,
    amount: buckets.get(bucket)!.amount,
  }));
}

export async function fetchClassDebtSummary(): Promise<ClassDebtSummaryRow[]> {
  const debtorRows = await fetchDebtorRows();
  const classRepository = AppDataSource.getRepository(Class);
  const classes = await classRepository.find({ order: { name: 'ASC' } });
  const classMap = new Map(classes.map((c) => [c.name, c]));

  const byClass = new Map<string, { owed: number; studentIds: Set<string> }>();

  for (const row of debtorRows) {
    const className = row.className || 'Unassigned';
    const entry = byClass.get(className) || { owed: 0, studentIds: new Set<string>() };
    entry.owed = round2(entry.owed + row.amountOwed);
    entry.studentIds.add(row.studentId);
    byClass.set(className, entry);
  }

  const result: ClassDebtSummaryRow[] = [];
  for (const [name, data] of byClass) {
    const cls = classMap.get(name);
    result.push({
      id: cls?.id || name,
      name,
      formName: cls?.form ?? null,
      owed: data.owed,
      studentsOwing: data.studentIds.size,
    });
  }

  result.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  return result;
}

export async function fetchRecentPayments(limit = 12): Promise<RecentPaymentRow[]> {
  const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
  const cap = Math.min(Math.max(Number(limit) || 12, 1), 100);

  const logs = await paymentLogRepository
    .createQueryBuilder('log')
    .innerJoinAndSelect('log.invoice', 'invoice')
    .leftJoinAndSelect('log.student', 'student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
    .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')")
    .orderBy('log.paymentDate', 'DESC')
    .addOrderBy('log.createdAt', 'DESC')
    .take(cap)
    .getMany();

  return logs.map((log) => {
    const stu = log.student;
    const inv = log.invoice;
    const feeLabel = deriveFeeCategoryLabel(inv, stu);
    return {
      id: log.id,
      date: log.paymentDate instanceof Date ? log.paymentDate.toISOString() : String(log.paymentDate),
      studentId: String(stu?.id || log.studentId),
      studentName: stu ? `${stu.firstName} ${stu.lastName}`.trim() : 'Unknown',
      studentNumber: String(stu?.studentNumber || ''),
      className: stu?.classEntity?.name ?? null,
      feeLabel,
      paymentMethod: log.paymentMethod,
      amount: round2(parseFloat(String(log.amountPaid ?? 0))),
      receiptNumber: log.receiptNumber,
    };
  });
}

export async function fetchDebtorRows(): Promise<DebtorRow[]> {
  const outstandingRows = await fetchOutstandingBalanceRows();
  const byStudent = new Map<string, DebtorRow & { dueDates: Date[] }>();

  for (const row of outstandingRows) {
    const existing = byStudent.get(row.studentId);
    const owed = round2(parseFloat(String(row.invoiceBalance || 0)));
    if (existing) {
      existing.amountOwed = round2(existing.amountOwed + owed);
    } else {
      byStudent.set(row.studentId, {
        studentId: row.studentId,
        studentNumber: row.studentNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        className: row.className,
        amountOwed: owed,
        oldestDueDate: null,
        dueDates: [],
      });
    }
  }

  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const studentIds = [...byStudent.keys()];
  if (studentIds.length > 0) {
    const invoices = await invoiceRepository.find({
      where: { studentId: In(studentIds) },
    });
    for (const inv of invoices) {
      const balance = computeCanonicalInvoiceBalance(inv);
      if (balance <= 0.005) continue;
      const entry = byStudent.get(inv.studentId);
      if (entry && inv.dueDate) {
        entry.dueDates.push(parseDateOnly(inv.dueDate)!);
      }
    }
  }

  const result: DebtorRow[] = [];
  for (const entry of byStudent.values()) {
    const oldest =
      entry.dueDates.length > 0
        ? entry.dueDates.reduce((min, d) => (d < min ? d : min), entry.dueDates[0])
        : null;
    result.push({
      studentId: entry.studentId,
      studentNumber: entry.studentNumber,
      firstName: entry.firstName,
      lastName: entry.lastName,
      className: entry.className,
      amountOwed: entry.amountOwed,
      oldestDueDate: oldest ? oldest.toISOString().split('T')[0] : null,
    });
  }

  result.sort((a, b) => b.amountOwed - a.amountOwed || a.studentNumber.localeCompare(b.studentNumber));
  return result;
}

type RawCashbookLine = {
  id: string;
  entryDate: Date;
  type: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  paymentMethod: string | null;
  reference: string | null;
  source: string;
  sortTs: number;
};

export async function fetchCashbookEntries(options?: {
  from?: string;
  to?: string;
  search?: string;
}): Promise<{ entries: CashbookRow[]; summary: { count: number; totalIn: number; totalOut: number } }> {
  await ensureCashbookTable();
  const paymentLogRepository = AppDataSource.getRepository(PaymentLog);
  const cashbookRepository = AppDataSource.getRepository(CashbookEntry);

  const fromDate = options?.from ? parseDateOnly(options.from) : null;
  let toDate = options?.to ? parseDateOnly(options.to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const paymentQb = paymentLogRepository
    .createQueryBuilder('log')
    .innerJoinAndSelect('log.invoice', 'invoice')
    .leftJoinAndSelect('log.student', 'student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where('ROUND(CAST(log.amountPaid AS numeric), 2) > 0')
    .andWhere("UPPER(COALESCE(log.paymentMethod, '')) NOT IN ('ADJUSTMENT', '')");

  if (fromDate) paymentQb.andWhere('log.paymentDate >= :fromDate', { fromDate });
  if (toDate) paymentQb.andWhere('log.paymentDate <= :toDate', { toDate });

  const manualQb = cashbookRepository
    .createQueryBuilder('e')
    .where("e.source = 'manual'")
    .andWhere('e.paymentLogId IS NULL');
  if (fromDate) manualQb.andWhere('e.entryDate >= :fromDate', { fromDate: options!.from });
  if (toDate) manualQb.andWhere('e.entryDate <= :toDate', { toDate: options!.to });

  const [paymentLogs, manualEntries] = await Promise.all([
    paymentQb.orderBy('log.paymentDate', 'ASC').addOrderBy('log.createdAt', 'ASC').getMany(),
    manualQb.orderBy('e.entryDate', 'ASC').addOrderBy('e.createdAt', 'ASC').getMany(),
  ]);

  const lines: RawCashbookLine[] = [];

  for (const log of paymentLogs) {
    const stu = log.student;
    const inv = log.invoice;
    const amount = round2(parseFloat(String(log.amountPaid ?? 0)));
    lines.push({
      id: `pl-${log.id}`,
      entryDate: parseDateOnly(log.paymentDate)!,
      type: CashbookEntryType.RECEIPT,
      description: buildCashbookLineDescription(inv, stu),
      moneyIn: amount,
      moneyOut: 0,
      paymentMethod: log.paymentMethod,
      reference: log.receiptNumber,
      source: 'payment_log',
      sortTs: new Date(log.paymentDate).getTime(),
    });
  }

  for (const entry of manualEntries) {
    lines.push({
      id: entry.id,
      entryDate: parseDateOnly(entry.entryDate)!,
      type: entry.type,
      description: oneLineText(entry.description),
      moneyIn: round2(parseFloat(String(entry.moneyIn ?? 0))),
      moneyOut: round2(parseFloat(String(entry.moneyOut ?? 0))),
      paymentMethod: entry.paymentMethod,
      reference: entry.reference,
      source: entry.source,
      sortTs: new Date(entry.entryDate).getTime(),
    });
  }

  lines.sort((a, b) => a.sortTs - b.sortTs || a.description.localeCompare(b.description));

  const search = String(options?.search || '')
    .trim()
    .toLowerCase();
  const filtered = search
    ? lines.filter(
        (l) =>
          l.description.toLowerCase().includes(search) ||
          String(l.reference || '')
            .toLowerCase()
            .includes(search)
      )
    : lines;

  let running = 0;
  const entries: CashbookRow[] = filtered.map((line) => {
    running = round2(running + line.moneyIn - line.moneyOut);
    return {
      id: line.id,
      entryDate: line.entryDate.toISOString().split('T')[0],
      type: line.type,
      description: line.description,
      moneyIn: line.moneyIn,
      moneyOut: line.moneyOut,
      balance: running,
      paymentMethod: line.paymentMethod,
      reference: line.reference,
      source: line.source,
    };
  });

  const totalIn = round2(filtered.reduce((s, l) => s + l.moneyIn, 0));
  const totalOut = round2(filtered.reduce((s, l) => s + l.moneyOut, 0));

  return {
    entries: entries.reverse(),
    summary: { count: filtered.length, totalIn, totalOut },
  };
}

function normalizePaymentMethod(raw?: string): string | null {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return 'CASH(USD)';
  if (val.includes('ecocash')) return 'ECOCASH(USD)';
  if (val.includes('bank') || val.includes('transfer')) return 'BANK TRANSFER(USD)';
  if (val.includes('cash')) return 'CASH(USD)';
  if (val === 'cash(usd)') return 'CASH(USD)';
  if (val === 'ecocash(usd)') return 'ECOCASH(USD)';
  if (val === 'bank transfer(usd)') return 'BANK TRANSFER(USD)';
  return null;
}

function generateReceiptNumber(): string {
  return `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
}

function extractStudentNumberFromCashbookText(text: string): string | null {
  const parenMatch = String(text || '').match(/\(([A-Z0-9-]+)\)/i);
  if (parenMatch?.[1]) return parenMatch[1].trim().toUpperCase();
  const trimmed = String(text || '').trim();
  if (/^[A-Z0-9-]{4,20}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/** Apply a student fee receipt to their invoice and create a payment log (shows in cashbook + ledger). */
export async function applyStudentPaymentFromCashbook(input: {
  studentId: string;
  invoiceId?: string;
  paidAmount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  payerUserId?: string;
  payerName?: string;
  receiptNumber?: string;
}): Promise<{ paymentLog: PaymentLog; invoice: Invoice }> {
  const paidAmountNum = round2(Math.abs(Number(input.paidAmount) || 0));
  if (paidAmountNum <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }

  const normalizedMethod = normalizePaymentMethod(input.paymentMethod);
  if (normalizedMethod === null) {
    throw new Error('Invalid payment method. Allowed: CASH(USD), ECOCASH(USD), BANK TRANSFER(USD)');
  }

  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const studentRepository = AppDataSource.getRepository(Student);
  const logRepo = AppDataSource.getRepository(PaymentLog);

  let invoiceId = input.invoiceId?.trim() || null;
  if (!invoiceId) {
    invoiceId = await findLatestInvoiceIdForStudent(input.studentId);
  }
  if (!invoiceId) {
    throw new Error('No invoice found for this student');
  }

  const invoice = await invoiceRepository.findOne({
    where: { id: invoiceId, studentId: input.studentId },
    relations: ['student'],
  });
  if (!invoice || invoice.isVoided) {
    throw new Error('Invoice not found for this student');
  }

  const oldPaidAmount = parseAmount(invoice.paidAmount);
  const oldPrepaidAmount = parseAmount(invoice.prepaidAmount);

  invoice.paidAmount = oldPaidAmount + paidAmountNum;
  recomputeInvoiceTotalsFromLineItems(invoice);

  const previousBalance = parseAmount(invoice.previousBalance);
  const termFees = canonicalInvoiceTermFees(invoice);
  const totalOwed = round2(previousBalance + termFees);
  const totalPaid = parseAmount(invoice.paidAmount);

  if (totalPaid > totalOwed + 0.005) {
    const excess = round2(totalPaid - totalOwed);
    invoice.paidAmount = totalOwed;
    invoice.prepaidAmount = round2(oldPrepaidAmount + excess);
    invoice.balance = 0;
    invoice.status = InvoiceStatus.PAID;
  }

  await invoiceRepository.save(invoice);

  const actualPaymentDate = parseDateOnly(input.paymentDate) || new Date();
  const receiptNumber =
    String(input.receiptNumber || '').trim() && !extractStudentNumberFromCashbookText(input.receiptNumber || '')
      ? String(input.receiptNumber).trim()
      : generateReceiptNumber();

  const log = logRepo.create({
    invoiceId: invoice.id,
    studentId: invoice.studentId,
    amountPaid: paidAmountNum,
    paymentDate: actualPaymentDate,
    paymentMethod: normalizedMethod,
    receiptNumber,
    payerUserId: input.payerUserId || null,
    payerName: input.payerName || null,
    notes: input.notes || null,
  });
  const paymentLog = await logRepo.save(log);

  return { paymentLog, invoice };
}

/** Backfill manual cashbook receipts that were saved without updating invoices. */
export async function reconcileOrphanCashbookStudentReceipts(): Promise<{ applied: number; skipped: number }> {
  await ensureCashbookTable();
  const cashbookRepository = AppDataSource.getRepository(CashbookEntry);
  const studentRepository = AppDataSource.getRepository(Student);

  const orphans = await cashbookRepository.find({
    where: { source: 'manual', type: CashbookEntryType.RECEIPT },
    order: { entryDate: 'ASC', createdAt: 'ASC' },
  });
  const pending = orphans.filter((e) => !e.paymentLogId);
  if (pending.length === 0) return { applied: 0, skipped: 0 };

  const students = await studentRepository.find({ select: ['id', 'studentNumber'] });
  const byNumber = new Map(
    students
      .map((s) => [String(s.studentNumber || '').trim().toUpperCase(), s.id] as const)
      .filter(([num]) => !!num)
  );

  let applied = 0;
  let skipped = 0;

  for (const entry of pending) {
    const refNum = extractStudentNumberFromCashbookText(entry.reference || '');
    const descNum = extractStudentNumberFromCashbookText(entry.description || '');
    const studentNumber = refNum || descNum;
    const studentId = studentNumber ? byNumber.get(studentNumber.toUpperCase()) : undefined;
    if (!studentId) {
      skipped += 1;
      continue;
    }

    try {
      const amount = round2(parseFloat(String(entry.moneyIn ?? 0)));
      if (amount <= 0) {
        skipped += 1;
        continue;
      }

      await applyStudentPaymentFromCashbook({
        studentId,
        paidAmount: amount,
        paymentDate: (parseDateOnly(entry.entryDate) || new Date()).toISOString().split('T')[0],
        paymentMethod: entry.paymentMethod || undefined,
        notes: entry.description,
        receiptNumber: entry.reference || undefined,
      });

      await cashbookRepository.delete(entry.id);
      applied += 1;
    } catch (err) {
      console.warn('[CashbookReconcile] Skipped orphan entry', entry.id, err);
      skipped += 1;
    }
  }

  if (applied > 0) {
    console.log(`[CashbookReconcile] Applied ${applied} orphan student receipt(s) to invoices`);
  }

  return { applied, skipped };
}

export async function createManualCashbookEntry(input: {
  entryDate: string;
  type: CashbookEntryType;
  description: string;
  amount: number;
  paymentMethod?: string;
  reference?: string;
  createdById?: string;
}): Promise<CashbookEntry> {
  await ensureCashbookTable();
  const cashbookRepository = AppDataSource.getRepository(CashbookEntry);
  const amount = round2(Math.abs(Number(input.amount) || 0));
  const isReceipt = input.type === CashbookEntryType.RECEIPT;

  const entry = cashbookRepository.create({
    entryDate: parseDateOnly(input.entryDate) || new Date(),
    type: input.type,
    description: String(input.description || '').trim(),
    moneyIn: isReceipt ? amount : 0,
    moneyOut: isReceipt ? 0 : amount,
    paymentMethod: input.paymentMethod || null,
    reference: input.reference || null,
    source: 'manual',
    createdById: input.createdById || null,
  });

  return cashbookRepository.save(entry);
}

export async function fetchStudentStatement(studentId: string): Promise<StudentStatementPayload | null> {
  const studentRepository = AppDataSource.getRepository(Student);
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

  const student = await studentRepository.findOne({
    where: { id: studentId },
    relations: ['classEntity'],
  });
  if (!student) return null;

  const configuredDeskFee = await loadSettingsDeskFee();
  const invoices = await invoiceRepository.find({
    where: { studentId },
    order: { dueDate: 'ASC', createdAt: 'ASC' },
  });
  const nonVoided = invoices.filter((i) => !i.isVoided);

  const paymentLogs = await paymentLogRepository.find({
    where: { studentId },
    relations: ['invoice'],
    order: { paymentDate: 'ASC', createdAt: 'ASC' },
  });

  let totalInvoiced = 0;
  let totalPaid = 0;
  const invoiceRows: StudentStatementInvoiceRow[] = nonVoided.map((inv) => {
    const termFees = round2(
      parseFloat(String(inv.tuitionAmount ?? 0)) +
        parseFloat(String(inv.transportAmount ?? 0)) +
        parseFloat(String(inv.diningHallAmount ?? 0)) +
        parseFloat(String(inv.registrationAmount ?? 0)) +
        parseFloat(String(inv.deskFeeAmount ?? 0)) +
        parseFloat(String(inv.uniformTotal ?? 0))
    );
    const total = round2(parseFloat(String(inv.previousBalance ?? 0)) + termFees);
    const paid = round2(parseFloat(String(inv.paidAmount ?? 0)));
    const balance = computeCanonicalInvoiceBalance(inv);
    totalInvoiced = round2(totalInvoiced + total);
    totalPaid = round2(totalPaid + paid);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      description: inv.description,
      total,
      paid,
      balance,
      status: String(inv.status),
      dueDate: inv.dueDate instanceof Date ? inv.dueDate.toISOString().split('T')[0] : String(inv.dueDate),
      term: inv.term,
    };
  });

  const balance = computeStudentTotalOutstanding(nonVoided, student, configuredDeskFee);

  const ledgerEvents: Array<{
    date: Date;
    description: string;
    debit: number;
    credit: number;
    sortKey: number;
  }> = [];

  for (const inv of nonVoided) {
    const termFees = round2(
      parseFloat(String(inv.tuitionAmount ?? 0)) +
        parseFloat(String(inv.transportAmount ?? 0)) +
        parseFloat(String(inv.diningHallAmount ?? 0)) +
        parseFloat(String(inv.registrationAmount ?? 0)) +
        parseFloat(String(inv.deskFeeAmount ?? 0)) +
        parseFloat(String(inv.uniformTotal ?? 0))
    );
    const prevBal = round2(parseFloat(String(inv.previousBalance ?? 0)));
    const invoiceTotal = round2(prevBal + termFees);
    if (invoiceTotal > 0.005) {
      ledgerEvents.push({
        date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || new Date(),
        description: `Invoice ${inv.invoiceNumber}${inv.term ? ` — ${inv.term}` : ''}`,
        debit: invoiceTotal,
        credit: 0,
        sortKey: new Date(inv.createdAt).getTime(),
      });
    }
  }

  for (const log of paymentLogs) {
    const amt = round2(parseFloat(String(log.amountPaid ?? 0)));
    if (amt <= 0.005) continue;
    if (String(log.paymentMethod || '').toUpperCase() === 'ADJUSTMENT') continue;
    ledgerEvents.push({
      date: parseDateOnly(log.paymentDate) || new Date(),
      description: `Payment${log.receiptNumber ? ` (${log.receiptNumber})` : ''}`,
      debit: 0,
      credit: amt,
      sortKey: new Date(log.createdAt).getTime(),
    });
  }

  ledgerEvents.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sortKey - b.sortKey);

  let ledgerBalance = 0;
  const ledger: StudentStatementLedgerRow[] = ledgerEvents.map((ev) => {
    ledgerBalance = round2(ledgerBalance + ev.debit - ev.credit);
    return {
      date: ev.date.toISOString().split('T')[0],
      description: ev.description,
      debit: ev.debit,
      credit: ev.credit,
      balance: ledgerBalance,
    };
  });

  const payments: StudentStatementPaymentRow[] = paymentLogs
    .filter((log) => round2(parseFloat(String(log.amountPaid ?? 0))) > 0.005)
    .filter((log) => String(log.paymentMethod || '').toUpperCase() !== 'ADJUSTMENT')
    .map((log) => ({
      id: log.id,
      reference: log.receiptNumber,
      amount: round2(parseFloat(String(log.amountPaid ?? 0))),
      label: log.invoice?.description || log.invoice?.term || 'Fee payment',
      method: log.paymentMethod,
      date:
        log.paymentDate instanceof Date
          ? log.paymentDate.toISOString().split('T')[0]
          : String(log.paymentDate).split('T')[0],
    }))
    .reverse();

  return {
    student: {
      id: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.classEntity?.name ?? null,
    },
    summary: {
      totalInvoiced,
      totalPaid,
      balance,
    },
    ledger,
    invoices: invoiceRows.reverse(),
    payments,
  };
}

export async function sendFeeRemindersToDebtors(
  studentIds: string[],
  sender: { id: string; email?: string; name?: string }
): Promise<{ sent: number; skipped: number }> {
  const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
  const messageRepository = AppDataSource.getRepository(Message);
  const studentRepository = AppDataSource.getRepository(Student);

  const uniqueIds = [...new Set(studentIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { sent: 0, skipped: 0 };

  const students = await studentRepository.find({ where: { id: In(uniqueIds) } });
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const links = await parentStudentRepository.find({ where: { studentId: In(uniqueIds) } });

  const parentIdsByStudent = new Map<string, string[]>();
  for (const link of links) {
    const list = parentIdsByStudent.get(link.studentId) || [];
    list.push(link.parentId);
    parentIdsByStudent.set(link.studentId, list);
  }

  let sent = 0;
  let skipped = 0;
  const subject = 'School Fees Reminder';
  const senderName = sender.name || sender.email || 'School Finance';

  for (const studentId of uniqueIds) {
    const student = studentMap.get(studentId);
    const parentIds = parentIdsByStudent.get(studentId) || [];
    if (!student || parentIds.length === 0) {
      skipped++;
      continue;
    }
    const body = `Dear Parent,\n\nThis is a friendly reminder that school fees are outstanding for ${student.firstName} ${student.lastName} (${student.studentNumber}). Kindly settle the balance at your earliest convenience.\n\nThank you,\nSchool Finance Office`;

    for (const parentId of parentIds) {
      const rec = messageRepository.create({
        subject,
        message: body,
        recipients: 'parent',
        senderId: sender.id,
        senderName,
        parentId,
        isRead: false,
        status: 'sent',
      });
      await messageRepository.save(rec);
      sent++;
    }
  }

  return { sent, skipped };
}

export async function findLatestInvoiceIdForStudent(studentId: string): Promise<string | null> {
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const studentRepository = AppDataSource.getRepository(Student);
  const student = await studentRepository.findOne({ where: { id: studentId } });
  if (!student) return null;

  const configuredDeskFee = await loadSettingsDeskFee();
  const invoices = await invoiceRepository.find({ where: { studentId }, order: { createdAt: 'DESC' } });
  const nonVoided = invoices.filter((i) => !i.isVoided);
  const outstanding = listStudentOutstandingInvoices(nonVoided, student, configuredDeskFee);
  if (outstanding.length > 0) return outstanding[0].invoiceId;
  if (nonVoided.length > 0) return nonVoided[0].id;
  return null;
}
