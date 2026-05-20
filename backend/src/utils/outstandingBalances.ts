import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { computeInvoiceOwedAmount, getConfiguredDeskFee } from './invoiceFeesBalance';
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
 * Students who owe money on any non-voided invoice.
 * Sums owed amounts per student (same balance rules as Billing & Invoicing).
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

  const openInvoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.student', 'student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(NOT_VOIDED)
    .orderBy('invoice.createdAt', 'DESC')
    .getMany();

  const totalsByStudent = new Map<
    string,
    { student?: Student; total: number }
  >();

  for (const invoice of openInvoices) {
    const owed = invoice.student
      ? computeInvoiceOwedAmount(invoice, invoice.student, configuredDeskFee)
      : parseAmount(invoice.balance);

    if (owed <= 0.005) {
      continue;
    }

    const studentId = invoice.studentId;
    const existing = totalsByStudent.get(studentId);
    if (existing) {
      existing.total = parseFloat((existing.total + owed).toFixed(2));
      if (!existing.student && invoice.student) {
        existing.student = invoice.student;
      }
    } else {
      totalsByStudent.set(studentId, {
        student: invoice.student,
        total: owed
      });
    }
  }

  const missingStudentIds = [...totalsByStudent.entries()]
    .filter(([, v]) => !v.student)
    .map(([id]) => id);

  if (missingStudentIds.length > 0) {
    const students = await studentRepository.find({
      where: { id: In(missingStudentIds) },
      relations: ['classEntity']
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));
    for (const id of missingStudentIds) {
      const entry = totalsByStudent.get(id);
      const student = studentMap.get(id);
      if (entry && student) {
        entry.student = student;
      } else if (entry) {
        totalsByStudent.delete(id);
      }
    }
  }

  const rows: OutstandingBalanceRow[] = [];
  for (const [studentId, { student, total }] of totalsByStudent) {
    if (!student || total <= 0.005) {
      continue;
    }
    rows.push({
      studentId,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      studentType: student.studentType,
      className: student.classEntity?.name ?? null,
      phoneNumber: student.phoneNumber || '',
      invoiceBalance: total
    });
  }

  rows.sort((a, b) => b.invoiceBalance - a.invoiceBalance);
  return rows;
}
