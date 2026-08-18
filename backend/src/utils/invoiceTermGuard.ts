import { Repository, Brackets } from 'typeorm';
import { Invoice } from '../entities/Invoice';

/** Normalized term key for duplicate detection (case/space insensitive). */
export function normalizeInvoiceTermKey(term: string | null | undefined): string {
  return String(term ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Returns an active (non-void) invoice for this student+term, if any.
 * One invoice per student per term — voided rows do not block a replacement.
 *
 * Accepts either a `studentId` (UUID) OR a `studentNumber` — matches invoices
 * where either field aligns (handles historical studentId mismatches).
 */
export function findInvoiceForStudentTermInList(
  invoices: Invoice[],
  studentId: string,
  term: string,
  studentNumber?: string
): Invoice | null {
  const termKey = normalizeInvoiceTermKey(term);
  if (!termKey) return null;

  const sn = studentNumber ? String(studentNumber).trim() : null;
  const sid = studentId ? String(studentId).trim() : null;

  return (
    invoices.find(
      (inv) =>
        !inv.isVoided &&
        normalizeInvoiceTermKey(inv.term) === termKey &&
        (
          (sid && inv.studentId === sid) ||
          (sn && inv.student && inv.student.studentNumber && String(inv.student.studentNumber).trim() === sn)
        )
    ) || null
  );
}

/**
 * Queries the DB for an active (non-void) invoice for this student+term.
 * Checks both `studentId` and `studentNumber` via a join so that historical
 * reference mismatches between invoices and the students table are still caught.
 */
export async function findActiveInvoiceForStudentTerm(
  invoiceRepository: Repository<Invoice>,
  studentId: string,
  term: string,
  studentNumber?: string
): Promise<Invoice | null> {
  const termKey = normalizeInvoiceTermKey(term);
  if (!termKey || !studentId) return null;

  const sn = studentNumber ? String(studentNumber).trim() : null;
  const sid = studentId ? String(studentId).trim() : null;

  const qb = invoiceRepository
    .createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.student', 'student')
    .where('COALESCE(invoice.isVoided, false) = false')
    .andWhere(
      new Brackets((whereQb) => {
        whereQb = whereQb.where('invoice.studentId = :sid', { sid });
        if (sn) {
          whereQb = whereQb.orWhere('student.studentNumber = :sn', { sn });
        }
      })
    )
    .orderBy('invoice.createdAt', 'DESC');

  const candidates = await qb.getMany();
  return candidates.find((inv) => normalizeInvoiceTermKey(inv.term) === termKey) ?? null;
}

export function invoiceTermExistsMessage(
  term: string,
  existing: Pick<Invoice, 'invoiceNumber'>
): string {
  return `An invoice for ${term} already exists for this student (${existing.invoiceNumber}).`;
}
