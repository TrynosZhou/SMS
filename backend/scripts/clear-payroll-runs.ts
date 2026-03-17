/**
 * One-off script: Delete all payroll runs from March 2026 through January 2027.
 * Also deletes their payroll entries and entry lines.
 * Run from backend folder: npx ts-node scripts/clear-payroll-runs.ts
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { PayrollRun } from '../src/entities/PayrollRun';
import { PayrollEntry } from '../src/entities/PayrollEntry';
import { PayrollEntryLine } from '../src/entities/PayrollEntryLine';
import { In } from 'typeorm';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function clearPayrollRuns() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const lineRepo = AppDataSource.getRepository(PayrollEntryLine);

    // Find runs: March 2026 (3/2026) through January 2027 (1/2027)
    const runs = await runRepo
      .createQueryBuilder('r')
      .where('(r.year = 2026 AND r.month >= 3) OR (r.year = 2027 AND r.month <= 1)')
      .orderBy('r.year', 'ASC')
      .addOrderBy('r.month', 'ASC')
      .getMany();

    if (runs.length === 0) {
      console.log('No payroll runs found in range March 2026 – January 2027. Nothing to delete.');
      await AppDataSource.destroy();
      process.exit(0);
      return;
    }

    console.log(`Found ${runs.length} payroll run(s) to delete:`);
    runs.forEach((r) => console.log(`  - ${MONTH_NAMES[r.month]} ${r.year} (id: ${r.id})`));

    const runIds = runs.map((r) => r.id);
    const entries = await entryRepo.find({ where: { payrollRunId: In(runIds) }, select: ['id'] });
    const entryIds = entries.map((e) => e.id);

    if (entryIds.length > 0) {
      const lineResult = await lineRepo.delete({ payrollEntryId: In(entryIds) });
      console.log(`\n✓ Deleted ${typeof lineResult.affected === 'number' ? lineResult.affected : 0} payroll entry line(s)`);
      await entryRepo.delete({ payrollRunId: In(runIds) });
      console.log(`✓ Deleted ${entryIds.length} payroll entry(ies)`);
    }

    await runRepo.delete({ id: In(runIds) });
    console.log(`✓ Deleted ${runs.length} payroll run(s)`);

    console.log('\n✓ Payroll data cleared (March 2026 – January 2027).');
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Error:', error.message);
    console.error(error);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  }
}

clearPayrollRuns();
