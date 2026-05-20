import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import { restoreFullFeesToInvoice, isStaffSiblingExemption, studentHasActiveFeeExemption } from './exemptionInvoice';
import { parseAmount } from './numberUtils';

export type ExemptionReportRow = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  gender: string;
  className: string | null;
  amountExempted: number;
  exemptionType: string | null;
};

function cloneInvoice(inv: Invoice): Invoice {
  const copy = new Invoice();
  Object.assign(copy, {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    studentId: inv.studentId,
    amount: inv.amount,
    paidAmount: inv.paidAmount,
    balance: inv.balance,
    previousBalance: inv.previousBalance,
    prepaidAmount: inv.prepaidAmount,
    uniformTotal: inv.uniformTotal,
    tuitionAmount: inv.tuitionAmount,
    transportAmount: inv.transportAmount,
    diningHallAmount: inv.diningHallAmount,
    registrationAmount: inv.registrationAmount,
    deskFeeAmount: inv.deskFeeAmount,
    status: inv.status,
    dueDate: inv.dueDate,
    term: inv.term,
    description: inv.description,
    isVoided: inv.isVoided
  });
  return copy;
}

/** Total invoice value before payments: previous balance + current term fees. */
function invoiceGrossTotal(inv: Invoice): number {
  return parseFloat(
    (parseAmount(inv.previousBalance) + parseAmount(inv.amount)).toFixed(2)
  );
}

export function computeExemptedAmountForInvoice(
  student: Student,
  inv: Invoice,
  fees: Record<string, unknown>
): number {
  if (!studentHasActiveFeeExemption(student)) {
    return 0;
  }

  const fullClone = cloneInvoice(inv);
  restoreFullFeesToInvoice(student, fullClone, fees);

  const fullGross = invoiceGrossTotal(fullClone);
  const currentGross = invoiceGrossTotal(inv);
  let exempted = parseFloat((fullGross - currentGross).toFixed(2));

  if (exempted <= 0.005 && !isStaffSiblingExemption(student)) {
    if (student.exemptionType === 'fixed') {
      exempted = parseAmount(student.exemptionAmount);
    } else if (student.exemptionType === 'percentage') {
      const pct = parseAmount(student.exemptionPercent);
      const base = parseAmount(inv.balance) / Math.max(0.01, (100 - pct) / 100);
      exempted = parseFloat((base * (pct / 100)).toFixed(2));
    }
  }

  return Math.max(0, parseFloat(exempted.toFixed(2)));
}

export async function fetchExemptionReportRows(): Promise<ExemptionReportRow[]> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const studentRepository = AppDataSource.getRepository(Student);
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const settingsRepository = AppDataSource.getRepository(Settings);

  const settingsList = await settingsRepository.find({
    order: { createdAt: 'DESC' },
    take: 1
  });
  const settings = settingsList[0] ?? null;
  const fees = (settings?.feesSettings as Record<string, unknown>) || {};

  const students = await studentRepository.find({
    relations: ['classEntity'],
    order: { lastName: 'ASC', firstName: 'ASC' }
  });

  const exemptStudents = students.filter((s) => studentHasActiveFeeExemption(s));
  const rows: ExemptionReportRow[] = [];

  for (const student of exemptStudents) {
    const latest = await invoiceRepository.findOne({
      where: { studentId: student.id, isVoided: false },
      order: { createdAt: 'DESC' }
    });

    let amountExempted = 0;
    if (latest && Object.keys(fees).length > 0) {
      amountExempted = computeExemptedAmountForInvoice(student, latest, fees);
    } else if (student.exemptionType === 'fixed') {
      amountExempted = parseAmount(student.exemptionAmount);
    }

    rows.push({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      className: student.classEntity?.name ?? null,
      amountExempted,
      exemptionType: student.exemptionType || (student.isStaffChild ? 'staff_sibling' : null)
    });
  }

  rows.sort((a, b) => b.amountExempted - a.amountExempted);
  return rows;
}
