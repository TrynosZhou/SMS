import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { PaymentLog } from '../entities/PaymentLog';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import {
  computeCanonicalInvoiceBalance,
  computeStudentTotalOutstanding,
  getConfiguredDeskFee,
  hydrateInvoiceLineItemsFromAmount,
  listStudentOutstandingInvoices,
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

export type StudentLedgerLineType = 'opening' | 'invoice' | 'payment' | 'late_payment' | 'brought_forward';

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
  /** Closing balance for the selected term only (ledger lines). */
  closingBalance: number;
  /** Total owed across all terms — same rules as outstanding-fees report. */
  totalOutstanding: number;
};

export type StudentLedgerOutstandingInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  term: string | null;
  owed: number;
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
  outstandingInvoices: StudentLedgerOutstandingInvoice[];
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

function shortPaymentMethod(method: string | undefined | null): string {
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
  } else {
    terms = await mergeInvoiceTermsIntoList(terms);
  }

  return terms;
}

/**
 * Compute the previous-term display name for brought-forward descriptions.
 * Prefers the real previous term from the ordered academic terms list (by
 * startDate then name). Falls back to an ordinal-based label:
 *   "Term 2" → "Term 1", "T2 2024" → "T1 2024", or finally "Previous term".
 */
function derivePreviousTermName(
  currentTerm: AcademicTermRecord,
  allTerms: AcademicTermRecord[] | null | undefined
): string {
  // Strategy 1: find the immediately-preceding term in the sorted list
  const sortedTerms = (allTerms ?? [])
    .slice()
    .sort((a, b) => {
      const aStart = new Date(a.startDate || 0).getTime();
      const bStart = new Date(b.startDate || 0).getTime();
      if (aStart && bStart && aStart !== bStart) return aStart - bStart;
      return (a.name || '').localeCompare(b.name || '');
    });
  const idx = sortedTerms.findIndex((t) => t.id === currentTerm.id);
  if (idx > 0) {
    const prev = sortedTerms[idx - 1];
    const name = termDisplayName(prev);
    if (name) return name;
  }

  // Strategy 2: ordinal decrement on the current term name (most robust fallback)
  const currentName = termDisplayName(currentTerm) || '';
  const ordinal = extractTermOrdinal(currentName) || extractTermOrdinal(currentTerm.term) || extractTermOrdinal(currentTerm.label);
  if (ordinal !== null && ordinal > 1) {
    const yearPart = extractYearPart(currentName) || extractYearPart(currentTerm.year) || extractYearPart(currentTerm.label) || '';
    const prevOrd = ordinal - 1;
    if (currentName && /^[Tt]\s*\d/.test(currentName.trim())) {
      return yearPart ? `T${prevOrd} ${yearPart}`.trim() : `T${prevOrd}`;
    }
    return yearPart ? `Term ${prevOrd} ${yearPart}`.trim() : `Term ${prevOrd}`;
  }

  return 'Previous term';
}

/**
 * Compute the next-term display name for carry-forward descriptions.
 * Prefers the real next term from the ordered academic terms list (by
 * startDate then name). Falls back to an ordinal-based label:
 *   "Term 2" → "Term 3", "T1 2024" → "T2 2024", or finally "Next term".
 */
function deriveNextTermName(
  currentTerm: AcademicTermRecord,
  allTerms: AcademicTermRecord[] | null | undefined
): string {
  // Strategy 1: find the immediately-following term in the sorted list
  const sortedTerms = (allTerms ?? [])
    .slice()
    .sort((a, b) => {
      const aStart = new Date(a.startDate || 0).getTime();
      const bStart = new Date(b.startDate || 0).getTime();
      if (aStart && bStart && aStart !== bStart) return aStart - bStart;
      return (a.name || '').localeCompare(b.name || '');
    });
  const idx = sortedTerms.findIndex((t) => t.id === currentTerm.id);
  if (idx >= 0 && idx + 1 < sortedTerms.length) {
    const next = sortedTerms[idx + 1];
    const name = termDisplayName(next);
    if (name) return name;
  }

  // Strategy 2: ordinal bump on the current term name (most robust fallback)
  const currentName = termDisplayName(currentTerm) || '';
  const ordinal = extractTermOrdinal(currentName) || extractTermOrdinal(currentTerm.term) || extractTermOrdinal(currentTerm.label);
  if (ordinal !== null) {
    const yearPart = extractYearPart(currentName) || extractYearPart(currentTerm.year) || extractYearPart(currentTerm.label) || '';
    const nextOrd = ordinal + 1;
    if (currentName && /^[Tt]\s*\d/.test(currentName.trim())) {
      return yearPart ? `T${nextOrd} ${yearPart}`.trim() : `T${nextOrd}`;
    }
    return yearPart ? `Term ${nextOrd} ${yearPart}`.trim() : `Term ${nextOrd}`;
  }

  return 'Next term';
}

async function mergeInvoiceTermsIntoList(terms: AcademicTermRecord[]): Promise<AcademicTermRecord[]> {
  const invoiceTerms = await loadDistinctInvoiceTerms();
  const merged = [...terms];
  for (const invTerm of invoiceTerms) {
    const alreadyCovered = merged.some((t) => invoiceMatchesTerm(invTerm.name, t));
    if (!alreadyCovered) {
      merged.push(invTerm);
    }
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
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

function extractTermOrdinal(value: unknown): number | null {
  const s = String(value ?? '').toLowerCase();
  if (!s) return null;
  const patterns = [
    /\b(?:term|t|semester|sem)\s*([1-4])\b/i,
    /\b([1-4])\s*(?:st|nd|rd|th)?\s*(?:term|t|semester|sem)\b/i,
    /^t([1-4])\b/i,
    /^term\s*([1-4])\b/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 4) return n;
    }
  }
  const bare = s.match(/\b([1-4])\b/);
  if (bare && /term|t[ -]|semester|sem/i.test(s)) {
    const n = parseInt(bare[1], 10);
    if (n >= 1 && n <= 4) return n;
  }
  return null;
}

function extractYearPart(value: unknown): string | null {
  const s = String(value ?? '');
  const m = s.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? m[1] : null;
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

  const invOrdinal = extractTermOrdinal(invoiceTerm);
  const termOrdinal = extractTermOrdinal(term.name) || extractTermOrdinal(term.label) || extractTermOrdinal(term.term);
  const invYear = extractYearPart(invoiceTerm);
  const termYear = extractYearPart(term.name) || extractYearPart(term.label) || extractYearPart(term.year);

  if (invOrdinal !== null && termOrdinal !== null && invOrdinal === termOrdinal) {
    if (!invYear || !termYear || invYear === termYear) {
      return true;
    }
    if (invYear && termYear) {
      const diff = Math.abs(parseInt(invYear, 10) - parseInt(termYear, 10));
      if (diff <= 1) return true;
    }
  }

  return false;
}

function invoiceFallsWithinTermDates(invoice: Invoice, termMeta: AcademicTermRecord): boolean {
  if (!termMeta.startDate || !termMeta.endDate) return false;
  const start = parseDateOnly(termMeta.startDate);
  const end = parseDateOnly(termMeta.endDate);
  if (!start || !end) return false;
  const checkPoints: Date[] = [];
  const due = parseDateOnly(invoice.dueDate);
  const created = parseDateOnly(invoice.createdAt);
  if (due) checkPoints.push(due);
  if (created) checkPoints.push(created);
  if (checkPoints.length === 0) return false;
  const startMs = start.getTime();
  const endMs = end.getTime() + 24 * 60 * 60 * 1000;
  return checkPoints.some((d) => {
    const t = d.getTime();
    return t >= startMs && t <= endMs;
  });
}

function resolveTermInvoices(
  allInvoices: Invoice[],
  termMeta: AcademicTermRecord,
  outstandingInvoiceTerms?: Array<string | null>
): Invoice[] {
  const nonVoid = allInvoices.filter((inv) => !inv.isVoided);
  let matched = nonVoid.filter((inv) => invoiceMatchesTerm(inv.term, termMeta));

  if (matched.length === 0) {
    const target = normalizeTermKey(termMeta.name);
    matched = nonVoid.filter((inv) => normalizeTermKey(inv.term) === target);
  }

  if (matched.length === 0) {
    matched = nonVoid.filter((inv) => invoiceFallsWithinTermDates(inv, termMeta));
  }

  if (matched.length === 0 && outstandingInvoiceTerms && outstandingInvoiceTerms.length > 0) {
    const ordinal = extractTermOrdinal(termMeta.name) || extractTermOrdinal(termMeta.label) || extractTermOrdinal(termMeta.term);
    const termYear = extractYearPart(termMeta.name) || extractYearPart(termMeta.label) || extractYearPart(termMeta.year);
    matched = nonVoid.filter((inv) => {
      const invOrd = extractTermOrdinal(inv.term);
      const invYr = extractYearPart(inv.term);
      if (ordinal !== null && invOrd !== null && ordinal === invOrd) {
        if (!termYear || !invYr || termYear === invYr) return true;
        if (termYear && invYr) {
          const diff = Math.abs(parseInt(termYear, 10) - parseInt(invYr, 10));
          if (diff <= 1) return true;
        }
      }
      return false;
    });
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
  const settingsRepository = AppDataSource.getRepository(Settings);

  const student = await studentRepository.findOne({
    where: { id: studentId },
    relations: ['classEntity'],
  });
  if (!student) return null;

  const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
  const configuredDeskFee = getConfiguredDeskFee(settingsList[0] ?? null);

  const allTerms = await loadAcademicTerms();
  const nextTermName = deriveNextTermName(termMeta, allTerms);

  const allInvoices = await invoiceRepository.find({
    where: { studentId },
    order: { dueDate: 'ASC', createdAt: 'ASC' },
  });
  const outstandingInvoiceRows = listStudentOutstandingInvoices(allInvoices, student, configuredDeskFee);
  const totalOutstanding = computeStudentTotalOutstanding(allInvoices, student, configuredDeskFee);
  const outstandingTerms = outstandingInvoiceRows.map((r) => r.term);
  let termInvoices = resolveTermInvoices(allInvoices, termMeta, outstandingTerms);
  
  // Check if this is a new student (no previous invoices before the current term)
  const isNewStudent = allInvoices.length === 0 || (termInvoices.length > 0 && termInvoices[0].id === allInvoices[0].id);
  const studentEnrollmentDate = student.enrollmentDate ? parseDateOnly(student.enrollmentDate) : null;
  
  // For new students, the opening balance date should be the enrollment date
  const openingBalanceDate = (isNewStudent && studentEnrollmentDate) 
    ? studentEnrollmentDate 
    : (parseDateOnly(termMeta.startDate) || new Date());

  if (termInvoices.length === 0 && outstandingInvoiceRows.length > 0) {
    const outstandingIds = new Set(outstandingInvoiceRows.map((r) => r.invoiceId));
    const outstandingInvoices = allInvoices.filter((inv) => outstandingIds.has(inv.id));
    const ordinal = extractTermOrdinal(termMeta.name) || extractTermOrdinal(termMeta.label) || extractTermOrdinal(termMeta.term);
    const termYear = extractYearPart(termMeta.name) || extractYearPart(termMeta.label) || extractYearPart(termMeta.year);
    const matchedByOrdinal = outstandingInvoices.filter((inv) => {
      const invOrd = extractTermOrdinal(inv.term);
      const invYr = extractYearPart(inv.term);
      if (ordinal !== null && invOrd !== null && ordinal === invOrd) {
        if (!termYear || !invYr || termYear === invYr) return true;
        if (termYear && invYr) {
          const diff = Math.abs(parseInt(termYear, 10) - parseInt(invYr, 10));
          if (diff <= 1) return true;
        }
      }
      return false;
    });
    if (matchedByOrdinal.length > 0) {
      termInvoices = matchedByOrdinal;
    } else if (outstandingInvoices.length === 1) {
      termInvoices = outstandingInvoices;
    }
  }

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

  // Add opening balance row at the start for new student accounts
  // Use term start date for opening balance to ensure it appears first chronologically
  const adjustedOpeningDate = parseDateOnly(termMeta.startDate) || openingBalanceDate;
  
  events.push({
    date: openingBalanceDate,
    type: 'opening',
    reference: '',
    description: 'New student account',
    debit: 0,
    credit: 0,
    sortKey: 0, // Opening balance appears first
  });

  for (const inv of termInvoices) {
    const prevBal = round2(parseFloat(String(inv.previousBalance ?? 0)));
    const termFees = invoiceTermFeesForLedger(inv);
    const totalOwed = round2(prevBal + termFees);
    openingBalanceTotal = round2(openingBalanceTotal + prevBal);

    const openDate =
      (isNewStudent && studentEnrollmentDate) ? studentEnrollmentDate :
      (parseDateOnly(inv.dueDate) ||
      parseDateOnly(inv.createdAt) ||
      parseDateOnly(termMeta.startDate) ||
      new Date());

    if (Math.abs(prevBal) > 0.005) {
      const isCredit = prevBal < 0;
      events.push({
        date: openDate,
        type: 'opening',
        reference: inv.invoiceNumber,
        description: isCredit ? 'Opening — prepaid credit' : 'Opening — prior balance',
        debit: prevBal > 0 ? prevBal : 0,
        credit: prevBal < 0 ? Math.abs(prevBal) : 0,
        sortKey: 0, // Opening balance entries appear first
      });
    }

    if (termFees > 0.005) {
      // Use the actual invoice date (dueDate or createdAt) to maintain chronological order
      const invoiceDisplayDate = parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate;
      events.push({
        date: invoiceDisplayDate,
        type: 'invoice',
        reference: inv.invoiceNumber,
        description: (() => {
          const raw = inv.description?.trim();
          if (raw && raw.length <= 28) return shortLedgerText(raw, 28);
          return 'Term fees';
        })(),
        debit: termFees,
        credit: 0,
        sortKey: 1, // Invoices appear after opening balance but before payments
      });
    }

    const invoiceLogs = paymentLogsByInvoice.get(inv.id) || [];
    let loggedPayments = 0;
    let runningTotal = 0;
    
    for (const log of invoiceLogs) {
      const amt = round2(parseFloat(String(log.amountPaid ?? 0)));
      if (amt <= 0.005) continue;
      if (String(log.paymentMethod || '').toUpperCase() === 'ADJUSTMENT') continue;
      
      const paymentDate = parseDateOnly(log.paymentDate) || new Date();
      
      // Check if payment is after term end date (late payment)
      const termEndDate = parseDateOnly(termMeta.endDate);
      const isLatePayment = termEndDate && paymentDate.getTime() > termEndDate.getTime();
      
      // Check if this specific payment creates a prepaid amount
      runningTotal = round2(runningTotal + amt);
      const paymentCreatesPrepaid = runningTotal > totalOwed + 0.005;
      const prepaidAmount = paymentCreatesPrepaid ? round2(runningTotal - totalOwed) : 0;
      
      // All actual payments are logged as payments - invoices must exist first
      loggedPayments = round2(loggedPayments + amt);
      events.push({
        date: paymentDate,
        type: isLatePayment ? 'late_payment' : 'payment',
        reference: log.receiptNumber || log.id,
        description: (() => {
          const method = shortPaymentMethod(log.paymentMethod);
          if (isLatePayment) {
            return method ? `Late Payment - ${method}` : `Late Payment`;
          }
          if (paymentCreatesPrepaid && prepaidAmount > 0.005) {
            return method ? `Payment - ${method} (Prepaid invoice: ${prepaidAmount.toFixed(2)})` : `Payment (Prepaid invoice: ${prepaidAmount.toFixed(2)})`;
          }
          return method ? `Payment - ${method}` : 'Payment';
        })(),
        debit: 0,
        credit: amt,
        sortKey: 2, // Ensure payments come after invoices
      });
    }
    
    const prepaidApplied = appliedPrepaidOnInvoice(inv, totalOwed);
    if (prepaidApplied > 0.005) {
      // For new students, use enrollment date; for existing students, use term start date
      const invoiceDisplayDate = (isNewStudent && studentEnrollmentDate) 
        ? studentEnrollmentDate 
        : (parseDateOnly(termMeta.startDate) || openDate);
      events.push({
        date: invoiceDisplayDate,
        type: 'payment',
        reference: inv.invoiceNumber,
        description: 'Prepaid applied from previous term',
        debit: 0,
        credit: prepaidApplied,
        sortKey: 2, // Prepaid applied appears after invoices
      });
    }

    const canonicalBalance = round2(computeCanonicalInvoiceBalance(inv));

    const invoiceDebits = round2((prevBal > 0 ? prevBal : 0) + termFees);
    const invoiceCredits = round2(
      loggedPayments +
      prepaidApplied
    );

    if (canonicalBalance > 0.005 && invoiceDebits <= 0.005) {
      // For new students, use enrollment date; for existing students, use term start date
      const invoiceDisplayDate = (isNewStudent && studentEnrollmentDate) 
        ? studentEnrollmentDate 
        : (parseDateOnly(termMeta.startDate) || parseDateOnly(inv.createdAt) || openDate);
      events.push({
        date: invoiceDisplayDate,
        type: 'invoice',
        reference: inv.invoiceNumber,
        description: 'Outstanding balance',
        debit: canonicalBalance,
        credit: 0,
        sortKey: 1, // Outstanding balance entries appear with other invoice entries
      });
    }
  }

  if (events.length === 0 && outstandingInvoiceRows.length > 0) {
    const outstandingIds = new Set(outstandingInvoiceRows.map((r) => r.invoiceId));
    const fallbackInvoices = allInvoices.filter((inv) => outstandingIds.has(inv.id) && !inv.isVoided);
    for (const inv of fallbackInvoices) {
      const prevBal = round2(parseFloat(String(inv.previousBalance ?? 0)));
      const termFees = invoiceTermFeesForLedger(inv);
      const rawPaidAmount = round2(parseFloat(String(inv.paidAmount ?? 0)));
      const prepaidRemaining = round2(parseFloat(String(inv.prepaidAmount ?? 0)));
      const totalOwed = round2(prevBal + termFees);
      const appliedPrepaid = Math.min(prepaidRemaining, Math.max(0, totalOwed));

      const openDate =
        parseDateOnly(inv.dueDate) ||
        parseDateOnly(inv.createdAt) ||
        parseDateOnly(termMeta.startDate) ||
        new Date();

      openingBalanceTotal = round2(openingBalanceTotal + prevBal);

      if (Math.abs(prevBal) > 0.005) {
        const isCredit = prevBal < 0;
        events.push({
          date: openDate,
          type: 'opening',
          reference: inv.invoiceNumber,
          description: isCredit ? 'Opening — prepaid credit' : 'Opening — prior balance',
          debit: prevBal > 0 ? prevBal : 0,
          credit: prevBal < 0 ? Math.abs(prevBal) : 0,
          sortKey: 0, // Opening balance entries appear first
        });
      }

      const invoiceDebits = round2((prevBal > 0 ? prevBal : 0) + termFees);
      // For new students, use enrollment date; for existing students, use term start date
      const invoiceDisplayDate = (isNewStudent && studentEnrollmentDate) 
        ? studentEnrollmentDate 
        : (parseDateOnly(termMeta.startDate) || openDate);
      
      if (termFees > 0.005) {
        events.push({
          date: invoiceDisplayDate,
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: (() => {
            const raw = inv.description?.trim();
            if (raw && raw.length <= 28) return shortLedgerText(raw, 28);
            return 'Term fees';
          })(),
          debit: termFees,
          credit: 0,
          sortKey: 1, // Invoices appear after opening balance but before payments
        });
      }

      const canonicalBalance = round2(computeCanonicalInvoiceBalance(inv));
      if (canonicalBalance > 0.005 && invoiceDebits <= 0.005) {
        events.push({
          date: invoiceDisplayDate,
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: 'Outstanding balance',
          debit: canonicalBalance,
          credit: 0,
          sortKey: 1, // Outstanding balance entries appear with other invoice entries
        });
      }
    }
  }

  // Custom sort to ensure proper order: Opening Balance → Invoice → Payment
  // First by sortKey (which encodes type priority), then by date, then by reference
  events.sort(
    (a, b) => {
      // Primary sort by sortKey (Opening Balance=0, Invoice=1, Payment=2)
      const sortKeyDiff = a.sortKey - b.sortKey;
      if (sortKeyDiff !== 0) return sortKeyDiff;
      
      // Secondary sort by date (ascending)
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      // Tertiary sort by reference for consistency
      return a.reference.localeCompare(b.reference);
    }
  );

  let running = 0;
  const lines: StudentLedgerLine[] = events.map((ev) => {
    // For opening balance entries, always reset to 0 for new students
    if (ev.type === 'opening' && ev.reference === '') {
      running = 0;
    } else {
      running = round2(running + ev.debit - ev.credit);
    }
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

  let totalDebits = round2(lines.reduce((s, l) => s + l.debit, 0));
  let totalCredits = round2(lines.reduce((s, l) => s + l.credit, 0));
  let openingBalance = openingBalanceTotal;
  
  // Calculate closing balance from actual running balance of last line
  let closingBalance = lines.length > 0 ? lines[lines.length - 1].balance : 0;
  
  // Ensure closing balance matches canonical outstanding if no transactions
  if (lines.length === 0) {
    const termInvoicesForClosing = termInvoices.length > 0
      ? termInvoices
      : outstandingInvoiceRows.length > 0
        ? (() => {
            const outstandingIds = new Set(outstandingInvoiceRows.map((r) => r.invoiceId));
            return allInvoices.filter((inv) => outstandingIds.has(inv.id) && !inv.isVoided);
          })()
        : [];
    const canonicalClosing = round2(
      termInvoicesForClosing.reduce((sum, inv) => sum + computeCanonicalInvoiceBalance(inv), 0)
    );
    closingBalance = canonicalClosing;
  }

  // For term-specific ledger, calculate totalOutstanding using canonical balance from invoices
  // This ensures the total outstanding reflects the actual payment status, not just the running balance
  const termTotalOutstanding = computeStudentTotalOutstanding(allInvoices, student, configuredDeskFee);

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
      openingBalance,
      totalDebits,
      totalCredits,
      closingBalance,
      totalOutstanding: termTotalOutstanding,
    },
    outstandingInvoices: outstandingInvoiceRows.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      term: row.term,
      owed: row.owed,
    })),
  };
}
