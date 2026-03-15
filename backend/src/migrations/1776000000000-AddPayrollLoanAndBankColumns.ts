import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds columns for payroll: teacher bank/payment, ancillary paymentMethod,
 * payroll_entries paymentMethod/bankName, settings payrollSettings.
 */
export class AddPayrollLoanAndBankColumns1776000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Teachers: bank and payment method
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankName" varchar`);
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankAccountNumber" varchar`);
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankBranch" varchar`);
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`);

    // Ancillary staff: payment method
    await queryRunner.query(`ALTER TABLE "ancillary_staff" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`);

    // Payroll entries: payment method and bank
    await queryRunner.query(`ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar DEFAULT 'cash'`);
    await queryRunner.query(`ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "bankName" varchar`);

    // Settings: payrollSettings JSON
    await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "payrollSettings" json`);

    // Salary assignments: per-employee negotiated amounts (overrides structure default)
    await queryRunner.query(`ALTER TABLE "salary_assignments" ADD COLUMN IF NOT EXISTS "customComponents" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teachers"
        DROP COLUMN IF EXISTS "bankName",
        DROP COLUMN IF EXISTS "bankAccountNumber",
        DROP COLUMN IF EXISTS "bankBranch",
        DROP COLUMN IF EXISTS "paymentMethod"
    `);
    await queryRunner.query(`
      ALTER TABLE "ancillary_staff"
        DROP COLUMN IF EXISTS "paymentMethod"
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
        DROP COLUMN IF EXISTS "paymentMethod",
        DROP COLUMN IF EXISTS "bankName"
    `);
    await queryRunner.query(`
      ALTER TABLE "settings"
        DROP COLUMN IF EXISTS "payrollSettings"
    `);
    await queryRunner.query(`ALTER TABLE "salary_assignments" DROP COLUMN IF EXISTS "customComponents"`);
  }
}
