import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { PaymentLog } from '../entities/PaymentLog';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import {
  computeCanonicalInvoiceBalance,
  hydrateInvoiceLineItemsFromAmount,
} from './invoiceFeesBalance';
import { effectiveTermFeesForBalance } from './invoiceTermFees';

export type AcademicTermRecord = {
  id: string;
  type: string;
  label: string;
  term: string;
  year: string;
  startDate: string;
  endDate: string;
  name: string;
};

export type StudentLedgerLineType = 'opening' | 'invoice' | 'payment';

export type StudentLedgerLine = {
  date: string;
  type: StudentLedgerLineType;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StudentLedgerSummary = {
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
};

export type StudentLedgerStudent = {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  formName: string | null;
};

export type StudentLedgerTerm = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type StudentLedgerReport = {
  student: StudentLedgerStudent;
  term: StudentLedgerTerm;
  lines: StudentLedgerLine[];
  summary: StudentLedgerSummary;
};

export type StudentLedgerMatch = StudentLedgerStudent;

function round2(n: number): number {
  return parseFloat((Number(n) || 0).toFixed(2));
}

/** Keep ledger descriptions short for single-line table/PDF display. */
function shortLedgerText(text: string, max = 32): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

function shortPaymentMethod(method: string): string {
  const m = String(method || '').trim();
  if (!m) return '';
  const upper = m.toUpperCase();
  const abbrevs: Record<string, string> = {
    CASH: 'Cash',
    BANK: 'Bank',
    'BANK TRANSFER': 'Bank',
    TRANSFER: 'Bank',
    MOBILE: 'Mobile',
    'MOBILE MONEY': 'Mobile',
    ECOCASH: 'EcoCash',
    ONEMONEY: 'OneMoney',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    CHECK: 'Cheque',
  };
  if (abbrevs[upper]) return abbrevs[upper];
  return shortLedgerText(m, 14);
}

function parseDateOnly(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function termDisplayName(t: { label?: string; term?: string; year?: string }): string {
  const label = String(t.label || '').trim();
  if (label) return label;
  const term = String(t.term || '').trim();
  const year = String(t.year || '').trim();
  return [term, year].filter(Boolean).join(' ');
}

function termMatchKeys(t: AcademicTermRecord): string[] {
  const keys = new Set<string>();
  const name = termDisplayName(t);
  if (name) keys.add(name.toLowerCase());
  if (t.label) keys.add(String(t.label).trim().toLowerCase());
  const combo = `${String(t.term || '').trim()} ${String(t.year || '').trim()}`.trim().toLowerCase();
  if (combo) keys.add(combo);
  return [...keys];
}

export async function loadAcademicTerms(): Promise<AcademicTermRecord[]> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const settingsRepository = AppDataSource.getRepository(Settings);
  const rows = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
  const settings = rows[0];

  const parsed = parseAcademicTermsRaw(settings?.academicTerms);
  let terms = normalizeAcademicTermRecords(parsed);

  if (!terms.length) {
    terms = seedTermsFromLegacySettings(settings);
  }
  if (!terms.length) {
    terms = await loadDistinctInvoiceTerms();
  }

  return terms;
}

function parseAcademicTermsRaw(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function slugTermId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `term-${slug}` : `term-${index}`;
}

function formatDateOnly(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  const s = String(value).trim();
  if (!s) return '';
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().split('T')[0];
}

function normalizeAcademicTermRecords(raw: unknown[]): AcademicTermRecord[] {
  return raw
    .map((t: any, index: number) => {
      const label = String(t?.label || '').trim();
      const term = String(t?.term || '').trim();
      const year = String(t?.year || '').trim();
      const name = termDisplayName({ label, term, year });
      const id = String(t?.id || '').trim() || (name ? slugTermId(name, index) : '');
      if (!id) return null;
      const record: AcademicTermRecord = {
        id,
        type: String(t?.type || 'Regular').trim(),
        label,
        term,
        year,
        startDate: formatDateOnly(t?.startDate),
        endDate: formatDateOnly(t?.endDate),
        name: name || id,
      };
      return record;
    })
    .filter(Boolean) as AcademicTermRecord[];
}

function seedTermsFromLegacySettings(settings: Settings | null | undefined): AcademicTermRecord[] {
  const termName = String(settings?.activeTerm || settings?.currentTerm || '').trim();
  if (!termName) return [];
  const yearMatch = termName.match(/\d{4}/);
  return [
    {
      id: 'legacy-active-term',
      type: 'Regular',
      label: termName,
      term: termName,
      year: yearMatch ? yearMatch[0] : String(settings?.academicYear || new Date().getFullYear()),
      startDate: formatDateOnly(settings?.termStartDate),
      endDate: formatDateOnly(settings?.termEndDate),
      name: termName,
    },
  ];
}

async function loadDistinctInvoiceTerms(): Promise<AcademicTermRecord[]> {
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const rows = await invoiceRepository
    .createQueryBuilder('invoice')
    .select('DISTINCT invoice.term', 'term')
    .where('invoice.term IS NOT NULL')
    .andWhere("invoice.term != ''")
    .orderBy('invoice.term', 'DESC')
    .getRawMany();

  return (rows || [])
    .map((r: any, index: number) => {
      const termName = String(r?.term || '').trim();
      if (!termName) return null;
      const yearMatch = termName.match(/\d{4}/);
      return {
        id: slugTermId(termName, index),
        type: 'Regular',
        label: termName,
        term: termName,
        year: yearMatch ? yearMatch[0] : String(new Date().getFullYear()),
        startDate: '',
        endDate: '',
        name: termName,
      } satisfies AcademicTermRecord;
    })
    .filter(Boolean) as AcademicTermRecord[];
}

export async function resolveTermById(termId: string): Promise<AcademicTermRecord | null> {
  const id = String(termId || '').trim();
  if (!id) return null;
  const terms = await loadAcademicTerms();
  const lowered = id.toLowerCase();
  return (
    terms.find((t) => t.id === id) ||
    terms.find((t) => t.name.toLowerCase() === lowered || t.label.toLowerCase() === lowered) ||
    null
  );
}

function normalizeTermKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function invoiceMatchesTerm(invoiceTerm: string, term: AcademicTermRecord): boolean {
  const inv = normalizeTermKey(invoiceTerm);
  if (!inv) return false;

  const candidates = new Set<string>();
  for (const key of termMatchKeys(term)) {
    const normalized = normalizeTermKey(key);
    if (normalized) candidates.add(normalized);
  }
  candidates.add(normalizeTermKey(term.name));
  candidates.add(normalizeTermKey(term.label));
  candidates.add(normalizeTermKey(`${term.term || ''} ${term.year || ''}`.trim()));

  for (const key of candidates) {
    if (!key) continue;
    if (key === inv) return true;
    if (inv.includes(key) || key.includes(inv)) return true;
  }

  const termPart = normalizeTermKey(term.term);
  const yearPart = String(term.year || '').trim();
  if (termPart && yearPart && inv.includes(termPart) && inv.includes(yearPart.toLowerCase())) {
    return true;
  }

  return false;
}

function resolveTermInvoices(allInvoices: Invoice[], termMeta: AcademicTermRecord): Invoice[] {
  const nonVoid = allInvoices.filter((inv) => !inv.isVoided);
  let matched = nonVoid.filter((inv) => invoiceMatchesTerm(inv.term, termMeta));

  if (matched.length === 0) {
    const target = normalizeTermKey(termMeta.name);
    matched = nonVoid.filter((inv) => normalizeTermKey(inv.term) === target);
  }

  return matched;
}

function invoiceTermFeesForLedger(invoice: Invoice): number {
  const working = Object.assign(Object.create(Object.getPrototypeOf(invoice)), invoice) as Invoice;
  hydrateInvoiceLineItemsFromAmount(working);
  const uniform = round2(parseFloat(String(working.uniformTotal ?? 0)));
  return round2(effectiveTermFeesForBalance(working) + uniform);
}

function appliedPrepaidOnInvoice(invoice: Invoice, totalOwed: number): number {
  const prepaidRemaining = round2(parseFloat(String(invoice.prepaidAmount ?? 0)));
  return round2(Math.min(Math.max(0, prepaidRemaining), Math.max(0, totalOwed)));
}

function mapStudentRow(student: Student): StudentLedgerStudent {
  const classEntity = student.classEntity;
  return {
    id: student.id,
    admissionNumber: student.studentNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    className: classEntity?.name ?? null,
    formName: classEntity?.form ?? null,
  };
}

export async function searchStudentsForLedger(q: string, limit = 12): Promise<StudentLedgerMatch[]> {
  const query = String(q || '').trim();
  if (!query) return [];
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const studentRepository = AppDataSource.getRepository(Student);
  const like = `%${query}%`;
  const students = await studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where('student.isActive = true')
    .andWhere(
      `(LOWER(student.studentNumber) LIKE LOWER(:like)
        OR LOWER(student.firstName) LIKE LOWER(:like)
        OR LOWER(student.lastName) LIKE LOWER(:like)
        OR LOWER(CONCAT(student.firstName, ' ', student.lastName)) LIKE LOWER(:like))`,
      { like }
    )
    .orderBy('student.lastName', 'ASC')
    .addOrderBy('student.firstName', 'ASC')
    .take(Math.min(Math.max(limit, 1), 25))
    .getMany();
  return students.map(mapStudentRow);
}

export async function buildStudentLedgerReport(
  studentId: string,
  termId: string
): Promise<StudentLedgerReport | null> {
  const termMeta = await resolveTermById(termId);
  if (!termMeta) return null;

  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const studentRepository = AppDataSource.getRepository(Student);
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

  const student = await studentRepository.findOne({
    where: { id: studentId },
    relations: ['classEntity'],
  });
  if (!student) return null;

  const allInvoices = await invoiceRepository.find({
    where: { studentId },
    order: { dueDate: 'ASC', createdAt: 'ASC' },
  });
  const termInvoices = resolveTermInvoices(allInvoices, termMeta);

  const invoiceIds = termInvoices.map((i) => i.id);
  const paymentLogs =
    invoiceIds.length > 0
      ? await paymentLogRepository.find({
          where: { invoiceId: In(invoiceIds) },
          relations: ['invoice'],
          order: { paymentDate: 'ASC', createdAt: 'ASC' },
        })
      : [];

  const paymentLogsByInvoice = new Map<string, PaymentLog[]>();
  for (const log of paymentLogs) {
    const id = String(log.invoiceId || '');
    if (!id) continue;
    const bucket = paymentLogsByInvoice.get(id) || [];
    bucket.push(log);
    paymentLogsByInvoice.set(id, bucket);
  }

  const events: Array<{
    date: Date;
    type: StudentLedgerLineType;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    sortKey: number;
  }> = [];

  let openingBalanceTotal = 0;

  for (const inv of termInvoices) {
    const prevBal = round2(parseFloat(String(inv.previousBalance ?? 0)));
    const termFees = invoiceTermFeesForLedger(inv);
    const totalOwed = round2(prevBal + termFees);
    openingBalanceTotal = round2(openingBalanceTotal + prevBal);

    const openDate =
      parseDateOnly(termMeta.startDate) ||
      parseDateOnly(inv.dueDate) ||
      parseDateOnly(inv.createdAt) ||
      new Date();

    if (Math.abs(prevBal) > 0.005) {
      const isCredit = prevBal < 0;
      events.push({
        date: openDate,
        type: 'opening',
        reference: inv.invoiceNumber,
        description: isCredit ? 'Opening — prepaid credit' : 'Opening — prior balance',
        debit: prevBal > 0 ? prevBal : 0,
        credit: prevBal < 0 ? Math.abs(prevBal) : 0,
        sortKey: 0,
      });
    }

    if (termFees > 0.005) {
      events.push({
        date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
        type: 'invoice',
        reference: inv.invoiceNumber,
        description: (() => {
          const raw = inv.description?.trim();
          if (raw && raw.length <= 28) return shortLedgerText(raw, 28);
          return 'Term fees';
        })(),
        debit: termFees,
        credit: 0,
        sortKey: 1,
      });
    }

    const invoiceLogs = paymentLogsByInvoice.get(inv.id) || [];
    let loggedPayments = 0;
    for (const log of invoiceLogs) {
      const amt = round2(parseFloat(String(log.amountPaid ?? 0)));
      if (amt <= 0.005) continue;
      if (String(log.paymentMethod || '').toUpperCase() === 'ADJUSTMENT') continue;
      loggedPayments = round2(loggedPayments + amt);
      events.push({
        date: parseDateOnly(log.paymentDate) || new Date(),
        type: 'payment',
        reference: log.receiptNumber || log.id,
        description: (() => {
          const method = shortPaymentMethod(log.paymentMethod || '');
          return method ? `Payment — ${method}` : 'Payment';
        })(),
        debit: 0,
        credit: amt,
        sortKey: 2,
      });
    }

    const prepaidApplied = appliedPrepaidOnInvoice(inv, totalOwed);
    if (prepaidApplied > 0.005) {
      events.push({
        date: openDate,
        type: 'payment',
        reference: inv.invoiceNumber,
        description: 'Prepaid applied',
        debit: 0,
        credit: prepaidApplied,
        sortKey: 2,
      });
    }

    const paidOnInvoice = round2(parseFloat(String(inv.paidAmount ?? 0)));
    const unloggedPaid = round2(Math.max(0, paidOnInvoice - loggedPayments));
    if (unloggedPaid > 0.005) {
      events.push({
        date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
        type: 'payment',
        reference: inv.invoiceNumber,
        description: 'Payment applied',
        debit: 0,
        credit: unloggedPaid,
        sortKey: 2,
      });
    }

    const canonicalBalance = round2(computeCanonicalInvoiceBalance(inv));
    const invoiceDebits = round2((prevBal > 0 ? prevBal : 0) + termFees);
    const invoiceCredits = round2(loggedPayments + prepaidApplied + unloggedPaid);

    if (canonicalBalance > 0.005 && invoiceDebits <= 0.005) {
      events.push({
        date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
        type: 'invoice',
        reference: inv.invoiceNumber,
        description: 'Outstanding balance',
        debit: canonicalBalance,
        credit: 0,
        sortKey: 1,
      });
    } else if (Math.abs(round2(invoiceDebits - invoiceCredits) - canonicalBalance) > 0.02) {
      const delta = round2(canonicalBalance - (invoiceDebits - invoiceCredits));
      if (delta > 0.02) {
        events.push({
          date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: 'Balance adjustment',
          debit: delta,
          credit: 0,
          sortKey: 1,
        });
      } else if (delta < -0.02) {
        events.push({
          date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
          type: 'payment',
          reference: inv.invoiceNumber,
          description: 'Credit adjustment',
          debit: 0,
          credit: Math.abs(delta),
          sortKey: 2,
        });
      }
    }
  }

  events.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.sortKey - b.sortKey || a.reference.localeCompare(b.reference)
  );

  let running = 0;
  const lines: StudentLedgerLine[] = events.map((ev) => {
    running = round2(running + ev.debit - ev.credit);
    return {
      date: ev.date.toISOString().split('T')[0],
      type: ev.type,
      reference: ev.reference,
      description: ev.description,
      debit: ev.debit,
      credit: ev.credit,
      balance: running,
    };
  });

  const totalDebits = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredits = round2(lines.reduce((s, l) => s + l.credit, 0));
  const canonicalClosing = round2(
    termInvoices.reduce((sum, inv) => sum + computeCanonicalInvoiceBalance(inv), 0)
  );
  const closingBalance =
    Math.abs(round2(totalDebits - totalCredits) - canonicalClosing) > 0.02
      ? canonicalClosing
      : round2(totalDebits - totalCredits);

  return {
    student: mapStudentRow(student),
    term: {
      id: termMeta.id,
      name: termMeta.name,
      startDate: termMeta.startDate,
      endDate: termMeta.endDate,
    },
    lines,
    summary: {
      openingBalance: openingBalanceTotal,
      totalDebits,
      totalCredits,
      closingBalance,
    },
  };
}
