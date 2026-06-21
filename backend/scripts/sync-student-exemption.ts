import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Student } from '../src/entities/Student';
import { syncExemptionInvoicesForStudent } from '../src/utils/exemptionInvoice';
import { computeStudentTotalOutstanding } from '../src/utils/invoiceFeesBalance';
import { Invoice } from '../src/entities/Invoice';
import { Settings } from '../src/entities/Settings';
import { getConfiguredDeskFee } from '../src/utils/invoiceFeesBalance';

async function main() {
  const studentNumber = process.argv[2] || 'JPS5112026';
  await AppDataSource.initialize();
  const studentRepo = AppDataSource.getRepository(Student);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const settingsRepo = AppDataSource.getRepository(Settings);

  const student = await studentRepo
    .createQueryBuilder('student')
    .where('LOWER(student.studentNumber) = LOWER(:sn)', { sn: studentNumber })
    .getOne();

  if (!student) {
    console.error('Student not found:', studentNumber);
    process.exit(1);
  }

  console.log('Student:', student.studentNumber, student.firstName, student.lastName);
  console.log('Exemption:', {
    isExempted: student.isExempted,
    exemptionType: student.exemptionType,
    exemptionPercent: student.exemptionPercent,
    exemptionAmount: student.exemptionAmount,
  });

  const before = await invoiceRepo.find({ where: { studentId: student.id, isVoided: false } });
  const settings = await settingsRepo.find({ order: { createdAt: 'DESC' }, take: 1 });
  const deskFee = getConfiguredDeskFee(settings[0] ?? null);
  const balanceBefore = computeStudentTotalOutstanding(before, student, deskFee);
  console.log('Balance before sync:', balanceBefore);

  const result = await syncExemptionInvoicesForStudent(student.id);
  console.log('Sync result:', result);

  const after = await invoiceRepo.find({ where: { studentId: student.id, isVoided: false } });
  const balanceAfter = computeStudentTotalOutstanding(after, student, deskFee);
  console.log('Balance after sync:', balanceAfter);
  console.log(
    'Open invoices:',
    after.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      term: inv.term,
      amount: inv.amount,
      balance: inv.balance,
      tuition: inv.tuitionAmount,
      status: inv.status,
      isVoided: inv.isVoided,
    }))
  );

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
