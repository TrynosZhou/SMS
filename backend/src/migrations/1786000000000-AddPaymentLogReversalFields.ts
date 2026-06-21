import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentLogReversalFields1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_logs"
      ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "reversedByUserId" character varying,
      ADD COLUMN IF NOT EXISTS "reversalPaymentLogId" character varying,
      ADD COLUMN IF NOT EXISTS "reversesPaymentLogId" character varying
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_logs_reversesPaymentLogId"
      ON "payment_logs" ("reversesPaymentLogId")
      WHERE "reversesPaymentLogId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_logs_reversesPaymentLogId"`);
    await queryRunner.query(`
      ALTER TABLE "payment_logs"
      DROP COLUMN IF EXISTS "reversesPaymentLogId",
      DROP COLUMN IF EXISTS "reversalPaymentLogId",
      DROP COLUMN IF EXISTS "reversedByUserId",
      DROP COLUMN IF EXISTS "reversedAt"
    `);
  }
}
