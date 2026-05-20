import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { computeInvoiceFeesOutstanding, getConfiguredDeskFee } from './invoiceFeesBalance';
import { parseAmount } from './numberUtils';

export type OutstandingBalanceRow = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  gender: string;
  studentType: string;
  className: string | null;
  phoneNumber: string;
  invoiceBalance: number;
};

const NOT_VOIDED = 'COALESCE(invoice.isVoided, false) = false';

/**
 * Balance shown on finance screens — persisted invoice.balance first (updated on payment),
 * then formula fallback when the column is zero but line items still imply amount owed.
 */
function resolveOutstandingBalance(
  invoice: Invoice,
  student: NonNullable<Invoice['student']>,
  configuredDeskFee: number
): number {
  const fromColumn = parseAmount(invoice.balance);
  if (fromColumn > 0.005) {
    return parseFloat(fromColumn.toFixed(2));
  }
  const computed = computeInvoiceFeesOutstanding(invoice, student, configuredDeskFee);
  return parseFloat(computed.toFixed(2));
}

/** Latest non-voided invoice per student (PostgreSQL DISTINCT ON; safe fallback otherwise). */
async function fetchLatestInvoicesPerStudent(): Promise<Invoice[]> {
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const driverType = String((AppDataSource.options as { type?: string }).type || '');

  if (driverType === 'postgres') {
    const idRows: Array<{ id: string }> = await invoiceRepository.query(`
      SELECT DISTINCT ON ("studentId") id
      FROM invoices
      WHERE COALESCE("isVoided", false) = false
      ORDER BY "studentId", "createdAt" DESC
    `);
    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      return [];
    }
    return invoiceRepository.find({
      where: { id: In(ids) },
      relations: ['student', 'student.classEntity']
    });
  }

  // Fallback: one lookup per student (correct; used for non-Postgres dev DBs)
  const rows: Array<{ studentId: string; id: string }> = await invoiceRepository
    .createQueryBuilder('invoice')
    .select('invoice.studentId', 'studentId')
    .addSelect('MAX(invoice.createdAt)', 'maxCreated')
    .where(NOT_VOIDED)
    .groupBy('invoice.studentId')
    .getRawMany();

  if (rows.length === 0) {
    return [];
  }

  const invoices: Invoice[] = [];
  for (const row of rows) {
    const inv = await invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'classEntity')
      .where('invoice.studentId = :studentId', { studentId: row.studentId })
      .andWhere(NOT_VOIDED)
      .orderBy('invoice.createdAt', 'DESC')
      .getOne();
    if (inv) {
      invoices.push(inv);
    }
  }
  return invoices;
}

/**
 * Latest non-voided invoice per student with positive outstanding balance.
 */
export async function fetchOutstandingBalanceRows(): Promise<OutstandingBalanceRow[]> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const settingsRepository = AppDataSource.getRepository(Settings);
  const settingsList = await settingsRepository.find({
    order: { createdAt: 'DESC' },
    take: 1
  });
  const configuredDeskFee = getConfiguredDeskFee(settingsList[0] ?? null);

  const latestInvoices = await fetchLatestInvoicesPerStudent();
  const rows: OutstandingBalanceRow[] = [];

  for (const invoice of latestInvoices) {
    const student = invoice.student;
    if (!student) {
      continue;
    }

    const balance = resolveOutstandingBalance(invoice, student, configuredDeskFee);
    if (balance <= 0.005) {
      continue;
    }

    rows.push({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      studentType: student.studentType,
      className: student.classEntity?.name ?? null,
      phoneNumber: student.phoneNumber || '',
      invoiceBalance: balance
    });
  }

  rows.sort((a, b) => b.invoiceBalance - a.invoiceBalance);
  return rows;
}
