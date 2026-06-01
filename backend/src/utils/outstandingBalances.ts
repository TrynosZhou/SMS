import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import {
  computeStudentTotalOutstanding,
  getConfiguredDeskFee,
  listStudentOutstandingInvoices
} from './invoiceFeesBalance';

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
  /** Per-invoice row when a student owes on a specific term. */
  invoiceId: string;
  invoiceNumber: string;
  term: string | null;
  includesPriorTermBalance: boolean;
};

const NOT_VOIDED = 'COALESCE(invoice.isVoided, false) = false';

/**
 * One row per invoice that still has money owed (all terms).
 * Students with prior-term debt appear even when the latest term invoice is paid.
 */
export async function fetchOutstandingBalanceRows(): Promise<OutstandingBalanceRow[]> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const studentRepository = AppDataSource.getRepository(Student);
  const settingsRepository = AppDataSource.getRepository(Settings);

  const settingsList = await settingsRepository.find({
    order: { createdAt: 'DESC' },
    take: 1
  });
  const configuredDeskFee = getConfiguredDeskFee(settingsList[0] ?? null);

  const allInvoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.student', 'student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(NOT_VOIDED)
    .orderBy('invoice.createdAt', 'DESC')
    .getMany();

  const byStudent = new Map<string, { student?: Student; invoices: Invoice[] }>();

  for (const invoice of allInvoices) {
    const entry = byStudent.get(invoice.studentId) || { invoices: [] };
    entry.invoices.push(invoice);
    if (!entry.student && invoice.student) {
      entry.student = invoice.student;
    }
    byStudent.set(invoice.studentId, entry);
  }

  const missingStudentIds = [...byStudent.entries()]
    .filter(([, v]) => !v.student)
    .map(([id]) => id);

  if (missingStudentIds.length > 0) {
    const students = await studentRepository.find({
      where: { id: In(missingStudentIds) },
      relations: ['classEntity']
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));
    for (const id of missingStudentIds) {
      const entry = byStudent.get(id);
      const student = studentMap.get(id);
      if (entry && student) {
        entry.student = student;
      } else if (entry) {
        byStudent.delete(id);
      }
    }
  }

  const rows: OutstandingBalanceRow[] = [];

  for (const [studentId, { student, invoices }] of byStudent) {
    if (!student) continue;

    const outstanding = listStudentOutstandingInvoices(invoices, student, configuredDeskFee);
    if (outstanding.length === 0) continue;

    for (const detail of outstanding) {
      rows.push({
        studentId,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        studentType: student.studentType,
        className: student.classEntity?.name ?? null,
        phoneNumber: student.phoneNumber || '',
        invoiceBalance: detail.owed,
        invoiceId: detail.invoiceId,
        invoiceNumber: detail.invoiceNumber,
        term: detail.term,
        includesPriorTermBalance: detail.includesPriorTermBalance
      });
    }
  }

  rows.sort((a, b) => {
    const bal = b.invoiceBalance - a.invoiceBalance;
    if (Math.abs(bal) > 0.005) return bal;
    return String(a.studentNumber).localeCompare(String(b.studentNumber));
  });

  return rows;
}

/** Total owed school-wide (sum of per-invoice rows, no double-count). */
export async function fetchTotalOutstandingAmount(): Promise<number> {
  const rows = await fetchOutstandingBalanceRows();
  return parseFloat(rows.reduce((sum, r) => sum + r.invoiceBalance, 0).toFixed(2));
}
