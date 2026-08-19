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

export type StudentLedgerLineType = 'opening' | 'invoice' | 'payment' | 'carry_forward';

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
  } else {
    terms = await mergeInvoiceTermsIntoList(terms);
  }

  return terms;
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
      
      // Check if this specific payment log should be classified as carry-forward
      // If the amount matches previousBalance and there are no other payments, treat as carry-forward
      const isCarryForwardPayment = Math.abs(amt - prevBal) < 0.01 && prevBal > 0.005 && 
                                    invoiceLogs.length === 1 && 
                                    !String(log.paymentMethod || '').toLowerCase().includes('cash') &&
                                    !String(log.paymentMethod || '').toLowerCase().includes('transfer');
      
      // Additional check: if reference is invoice number and amount equals remaining balance, treat as carry-forward
      const referenceIsInvoice = String(log.receiptNumber || '').startsWith('INV-');
      const remainingBalanceBeforeLog = round2(termFees + prevBal - loggedPayments - prepaidApplied);
      const isInvoiceReferenceCarryForward = referenceIsInvoice && 
                                             Math.abs(amt - remainingBalanceBeforeLog) < 0.01 && 
                                             remainingBalanceBeforeLog > 0.005;
      
      if (isCarryForwardPayment || isInvoiceReferenceCarryForward) {
        events.push({
          date: parseDateOnly(log.paymentDate) || new Date(),
          type: 'carry_forward',
          reference: `BAL-CF-${nextTermName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase()}`,
          description: `Balance carried forward to ${nextTermName}`,
          debit: 0,
          credit: amt,
          sortKey: 3,
        });
      } else {
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

    const canonicalBalance = round2(computeCanonicalInvoiceBalance(inv));
    const canonicalPaidViaIdentity = round2(
      Math.max(0, round2(prevBal + termFees) - prepaidApplied - canonicalBalance)
    );
    const rawPaidAmount = round2(parseFloat(String(inv.paidAmount ?? 0)));
    const paidOnInvoice = canonicalPaidViaIdentity > 0.005 ? canonicalPaidViaIdentity : rawPaidAmount;

    const unloggedPaidRaw = round2(Math.max(0, paidOnInvoice - loggedPayments));
    const maxCreditableFromPaid = round2(Math.max(0, round2(termFees + prevBal) - canonicalBalance - prepaidApplied));
    const unloggedPaid = round2(Math.max(0, Math.min(unloggedPaidRaw, Math.max(0, maxCreditableFromPaid - loggedPayments - prepaidApplied))));

    // Check if this invoice has a previousBalance that should be treated as carry-forward
    const hasPreviousBalance = prevBal > 0.005;
    // If the invoice has previousBalance but the total payments don't account for it separately,
    // treat the previousBalance portion as carry-forward
    const previousBalanceNeedsCarryForward = hasPreviousBalance && loggedPayments <= 0.005;
    
    // Calculate what the remaining balance should be before this unlogged payment
    const balanceBeforeUnlogged = round2(termFees + prevBal - loggedPayments - prepaidApplied);
    // Check if this unlogged payment zeroes out the remaining balance exactly
    const zeroesOutRemainingBalance = Math.abs(unloggedPaid - balanceBeforeUnlogged) < 0.01 && balanceBeforeUnlogged > 0.005;
    
    // Additional check: if the invoice balance is 0 but there's still a previousBalance, it suggests carry-forward
    const balanceIsZeroButHasPrevious = Math.abs(canonicalBalance) < 0.005 && hasPreviousBalance;

    if (unloggedPaid > 0.005) {
      // Carry-forward split: the portion equal to previousBalance is
      // the unpaid closing balance being forwarded to the next term —
      // NOT a cash payment. Any remainder is a true unlogged cash payment.
      const carryForwardPortion = round2(Math.max(0, Math.min(unloggedPaid, Math.max(0, prevBal))));
      const trueCashRemainder = round2(Math.max(0, unloggedPaid - carryForwardPortion));

      // ENHANCED LOGIC: Multiple conditions to detect carry-forward
      // 1. If unloggedPaid equals previousBalance (within rounding)
      const isExactPreviousBalanceMatch = Math.abs(unloggedPaid - prevBal) < 0.01 && prevBal > 0.005;
      
      // 2. If unloggedPaid zeroes out the remaining balance exactly
      const isZeroingRemainingBalance = zeroesOutRemainingBalance;
      
      // 3. If there's a previous balance but no payment logs, and the unlogged amount is significant
      const isPreviousBalanceWithNoLogs = previousBalanceNeedsCarryForward && unloggedPaid > 0.005;
      
      // 4. If the description or reference suggests this is a carry-forward (check invoice description)
      const descriptionSuggestsCarryForward = String(inv.description || '').toLowerCase().includes('carry') || 
                                             String(inv.description || '').toLowerCase().includes('forward');
      
      // 5. If balance is zero but there's still a previous balance (suggests it was carried forward)
      const isZeroBalanceWithPrevious = balanceIsZeroButHasPrevious && unloggedPaid > 0.005;
      
      // 6. SPECIAL CASE: If the payment exactly matches the amount needed to zero out the balance
      // and there's no clear payment log evidence, treat as carry-forward
      const isSpecialCarryForwardCase = Math.abs(unloggedPaid - balanceBeforeUnlogged) < 0.01 && 
                                        balanceBeforeUnlogged > 0.005 && 
                                        loggedPayments <= 0.005 &&
                                        !String(inv.description || '').toLowerCase().includes('payment');
      
      const isCarryForwardCase = isExactPreviousBalanceMatch || isZeroingRemainingBalance || 
                                 isPreviousBalanceWithNoLogs || descriptionSuggestsCarryForward || 
                                 isZeroBalanceWithPrevious || isSpecialCarryForwardCase;
      
      const finalCarryForward = isCarryForwardCase ? unloggedPaid : carryForwardPortion;
      const finalCashRemainder = isCarryForwardCase ? 0 : trueCashRemainder;

      if (finalCarryForward > 0.005) {
        events.push({
          date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
          type: 'carry_forward',
          reference: `BAL-CF-${nextTermName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase()}`,
          description: `Balance carried forward to ${nextTermName}`,
          debit: 0,
          credit: finalCarryForward,
          sortKey: 3,
        });
      }

      if (finalCashRemainder > 0.005) {
        events.push({
          date: parseDateOnly(inv.dueDate) || parseDateOnly(inv.createdAt) || openDate,
          type: 'payment',
          reference: inv.invoiceNumber,
          description: 'Payment applied',
          debit: 0,
          credit: finalCashRemainder,
          sortKey: 2,
        });
      }
    }

    const invoiceDebits = round2((prevBal > 0 ? prevBal : 0) + termFees);
    const invoiceCredits = round2(
      loggedPayments +
      prepaidApplied +
      (events.filter((e) => e.type === 'carry_forward' || (e.type === 'payment' && e.sortKey === 2 && e.reference === inv.invoiceNumber)).reduce((s, e) => s + e.credit, 0))
    );

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
        // Only emit credit adjustment for actual cash overpayments — never
        // convert previousBalance (a prior-term DEBIT shown as Opening line)
        // into a fake "credit payment" here.
        const openingDebitShown = prevBal > 0.005 ? prevBal : 0;
        const nonOpeningCredits = round2(invoiceCredits - (openingDebitShown > 0.005 ? 0 : 0));
        const openingPlusDebits = round2(openingDebitShown + termFees);
        const expectedNetOfOpening = round2(openingPlusDebits - nonOpeningCredits);
        if (expectedNetOfOpening < -0.02 && nonOpeningCredits > 0.005) {
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
          sortKey: 0,
        });
      }

      const invoiceDebits = round2((prevBal > 0 ? prevBal : 0) + termFees);
      if (termFees > 0.005) {
        events.push({
          date: openDate,
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

      const canonicalBalance = round2(computeCanonicalInvoiceBalance(inv));
      if (canonicalBalance > 0.005 && invoiceDebits <= 0.005) {
        events.push({
          date: openDate,
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: 'Outstanding balance',
          debit: canonicalBalance,
          credit: 0,
          sortKey: 1,
        });
      }

      if (appliedPrepaid > 0.005) {
        events.push({
          date: openDate,
          type: 'payment',
          reference: inv.invoiceNumber,
          description: 'Prepaid applied',
          debit: 0,
          credit: appliedPrepaid,
          sortKey: 2,
        });
      }

      // Derive canonical cash paid via identity (consistent with receipt PDF)
      // so previousBalance artifacts are never converted to payment credits.
      const canonicalPaidViaIdentity = round2(
        Math.max(0, round2(prevBal + termFees) - appliedPrepaid - canonicalBalance)
      );
      const actualPaidToCredit = canonicalPaidViaIdentity > 0.005 ? canonicalPaidViaIdentity : rawPaidAmount;
      const maxCreditFromPaid = round2(Math.max(0, round2(prevBal + termFees) - canonicalBalance - appliedPrepaid));
      const safePaidCredit = round2(Math.min(actualPaidToCredit, maxCreditFromPaid));

      if (safePaidCredit > 0.005) {
        const carryForwardPortion = round2(Math.max(0, Math.min(safePaidCredit, Math.max(0, prevBal))));
        const trueCashRemainder = round2(Math.max(0, safePaidCredit - carryForwardPortion));

        // ENHANCED LOGIC: Multiple conditions to detect carry-forward (same as main logic)
        const isExactPreviousBalanceMatch = Math.abs(safePaidCredit - prevBal) < 0.01 && prevBal > 0.005;
        const balanceBeforeUnlogged = round2(termFees + prevBal - appliedPrepaid);
        const isZeroingRemainingBalance = Math.abs(safePaidCredit - balanceBeforeUnlogged) < 0.01 && balanceBeforeUnlogged > 0.005;
        const isPreviousBalanceWithNoLogs = prevBal > 0.005; // In fallback, assume no logs
        const descriptionSuggestsCarryForward = String(inv.description || '').toLowerCase().includes('carry') || 
                                               String(inv.description || '').toLowerCase().includes('forward');
        const isZeroBalanceWithPrevious = Math.abs(canonicalBalance) < 0.005 && prevBal > 0.005;
        const isSpecialCarryForwardCase = Math.abs(safePaidCredit - balanceBeforeUnlogged) < 0.01 && 
                                          balanceBeforeUnlogged > 0.005 && 
                                          !String(inv.description || '').toLowerCase().includes('payment');
        
        const isCarryForwardCase = isExactPreviousBalanceMatch || isZeroingRemainingBalance || 
                                   isPreviousBalanceWithNoLogs || descriptionSuggestsCarryForward || 
                                   isZeroBalanceWithPrevious || isSpecialCarryForwardCase;
        
        const finalCarryForward = isCarryForwardCase ? safePaidCredit : carryForwardPortion;
        const finalCashRemainder = isCarryForwardCase ? 0 : trueCashRemainder;

        if (finalCarryForward > 0.005) {
          events.push({
            date: openDate,
            type: 'carry_forward',
            reference: `BAL-CF-${nextTermName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase()}`,
            description: `Balance carried forward to ${nextTermName}`,
            debit: 0,
            credit: finalCarryForward,
            sortKey: 3,
          });
        }

        if (finalCashRemainder > 0.005) {
          events.push({
            date: openDate,
            type: 'payment',
            reference: inv.invoiceNumber,
            description: 'Payment applied',
            debit: 0,
            credit: finalCashRemainder,
            sortKey: 2,
          });
        }
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

  let totalDebits = round2(lines.reduce((s, l) => s + l.debit, 0));
  let totalCredits = round2(lines.reduce((s, l) => s + l.credit, 0));
  let openingBalance = openingBalanceTotal;
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
  let closingBalance =
    Math.abs(round2(totalDebits - totalCredits) - canonicalClosing) > 0.02
      ? canonicalClosing
      : round2(totalDebits - totalCredits);

  if (
    lines.length === 0 &&
    totalOutstanding > 0.005 &&
    totalDebits <= 0.005 &&
    totalCredits <= 0.005 &&
    closingBalance <= 0.005
  ) {
    totalDebits = round2(totalOutstanding);
    closingBalance = round2(totalOutstanding);
  }

  if (
    totalOutstanding > 0.005 &&
    Math.abs(closingBalance - totalOutstanding) > 0.02 &&
    closingBalance <= 0.005
  ) {
    closingBalance = round2(totalOutstanding);
    if (totalDebits <= 0.005 && totalCredits <= 0.005) {
      totalDebits = round2(totalOutstanding);
    }
  }

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
      totalOutstanding,
    },
    outstandingInvoices: outstandingInvoiceRows.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      term: row.term,
      owed: row.owed,
    })),
  };
}
