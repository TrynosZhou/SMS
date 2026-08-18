import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforces one active (non-void) invoice per student per term at the database level.
 */
export class AddUniqueStudentTermInvoice1789100000000 implements MigrationInterface {
  name = 'AddUniqueStudentTermInvoice1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoices_student_term_active"
      ON "invoices" ("studentId", LOWER(TRIM("term")))
      WHERE COALESCE("isVoided", false) = false
        AND "term" IS NOT NULL
        AND TRIM("term") <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_student_term_active"`);
  }
}
