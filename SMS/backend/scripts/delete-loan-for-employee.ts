/**
 * Delete loan record for a specific employee by name.
 * Usage: npx ts-node scripts/delete-loan-for-employee.ts "Trynos Zhou"
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Teacher } from '../src/entities/Teacher';
import { AncillaryStaff } from '../src/entities/AncillaryStaff';
import { EmployeeLoanAccount } from '../src/entities/EmployeeLoanAccount';
import { LoanSchedule } from '../src/entities/LoanSchedule';

const EMPLOYEE_NAME = (process.argv[2] || 'Trynos Zhou').trim();

async function deleteLoanForEmployee() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    if (!EMPLOYEE_NAME) {
      console.error('Usage: npx ts-node scripts/delete-loan-for-employee.ts "First Last"');
      process.exit(1);
    }

    const parts = EMPLOYEE_NAME.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    const teacherRepo = AppDataSource.getRepository(Teacher);
    const ancRepo = AppDataSource.getRepository(AncillaryStaff);
    const accountRepo = AppDataSource.getRepository(EmployeeLoanAccount);
    const scheduleRepo = AppDataSource.getRepository(LoanSchedule);

    const teachers = await teacherRepo
      .createQueryBuilder('t')
      .where('LOWER(TRIM(t.firstName)) = LOWER(:first)', { first: firstName })
      .andWhere('LOWER(TRIM(t.lastName)) = LOWER(:last)', { last: lastName })
      .getMany();

    const staff = await ancRepo
      .createQueryBuilder('a')
      .where('LOWER(TRIM(a.firstName)) = LOWER(:first)', { first: firstName })
      .andWhere('LOWER(TRIM(a.lastName)) = LOWER(:last)', { last: lastName })
      .getMany();

    const teacher = teachers[0] || null;
    const anc = staff[0] || null;

    if (!teacher && !anc) {
      console.log(`No employee found with name "${EMPLOYEE_NAME}".`);
      await AppDataSource.destroy();
      process.exit(1);
    }

    const teacherId = teacher ? teacher.id : null;
    const ancillaryStaffId = anc ? anc.id : null;
    const fullName = teacher
      ? `${(teacher.firstName || '').trim()} ${(teacher.lastName || '').trim()}`
      : `${(anc!.firstName || '').trim()} ${(anc!.lastName || '').trim()}`;

    console.log(`Employee: ${fullName} (${teacherId ? 'Teacher' : 'Ancillary'})\n`);

    if (teacherId) {
      const sDel = await scheduleRepo.delete({ teacherId });
      const aDel = await accountRepo.delete({ teacherId });
      console.log(`✓ Deleted ${typeof sDel.affected === 'number' ? sDel.affected : 0} loan schedule(s)`);
      console.log(`✓ Deleted ${typeof aDel.affected === 'number' ? aDel.affected : 0} loan account(s) for ${fullName}`);
    } else {
      const sDel = await scheduleRepo.delete({ ancillaryStaffId: ancillaryStaffId! });
      const aDel = await accountRepo.delete({ ancillaryStaffId: ancillaryStaffId! });
      console.log(`✓ Deleted ${typeof sDel.affected === 'number' ? sDel.affected : 0} loan schedule(s)`);
      console.log(`✓ Deleted ${typeof aDel.affected === 'number' ? aDel.affected : 0} loan account(s) for ${fullName}`);
    }

    console.log('\n✓ Done.');
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Error:', error.message);
    console.error(error);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  }
}

deleteLoanForEmployee();
