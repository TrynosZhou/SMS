import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { computeInvoiceFeesOutstanding, getConfiguredDeskFee } from './invoiceFeesBalance';

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

/**
 * Latest non-voided invoice per student with positive computed balance.
 * Uses two queries (settings + grouped invoices) instead of N+1 per student.
 */
export async function fetchOutstandingBalanceRows(): Promise<OutstandingBalanceRow[]> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const settingsRepository = AppDataSource.getRepository(Settings);

  const settingsList = await settingsRepository.find({
    order: { createdAt: 'DESC' },
    take: 1
  });
  const configuredDeskFee = getConfiguredDeskFee(settingsList[0] ?? null);

  const latestInvoices = await invoiceRepository
    .createQueryBuilder('invoice')
    .innerJoin(
      (qb) =>
        qb
          .select('sub.studentId', 'studentId')
          .addSelect('MAX(sub.createdAt)', 'maxCreatedAt')
          .from(Invoice, 'sub')
          .where('sub.isVoided = :voided', { voided: false })
          .groupBy('sub.studentId'),
      'latest',
      'invoice.studentId = latest.studentId AND invoice.createdAt = latest.maxCreatedAt'
    )
    .leftJoinAndSelect('invoice.student', 'student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where('invoice.isVoided = :voided', { voided: false })
    .getMany();

  const rows: OutstandingBalanceRow[] = [];

  for (const invoice of latestInvoices) {
    const student = invoice.student;
    if (!student) {
      continue;
    }

    const balance = computeInvoiceFeesOutstanding(invoice, student, configuredDeskFee);
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
      invoiceBalance: parseFloat(balance.toFixed(2))
    });
  }

  rows.sort((a, b) => b.invoiceBalance - a.invoiceBalance);
  return rows;
}
