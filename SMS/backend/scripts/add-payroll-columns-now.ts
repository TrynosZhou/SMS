/**
 * One-off script: add teachers/ancillary_staff/payroll_entries/settings columns
 * if they don't exist. Safe to run multiple times (uses IF NOT EXISTS).
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function run() {
  try {
    await AppDataSource.initialize();
    const q = AppDataSource.createQueryRunner();

    const statements = [
      `ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankName" varchar`,
      `ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankAccountNumber" varchar`,
      `ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankBranch" varchar`,
      `ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`,
      `ALTER TABLE "ancillary_staff" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`,
      `ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`,
      `ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "bankName" varchar`,
      `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "payrollSettings" json`,
      `ALTER TABLE "salary_assignments" ADD COLUMN IF NOT EXISTS "customComponents" json`,
    ];

    for (const sql of statements) {
      await q.query(sql);
      console.log('✓', sql.replace(/ADD COLUMN IF NOT EXISTS "([^"]+)".*/, '$1'));
    }

    await q.release();
    await AppDataSource.destroy();
    console.log('\n✓ All columns added. Restart the backend (npm run dev).');
    process.exit(0);
  } catch (err: any) {
    console.error('✗', err.message);
    process.exit(1);
  }
}

run();
