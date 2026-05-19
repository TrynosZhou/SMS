import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentExemptionFields1777100000000 implements MigrationInterface {
  name = 'AddStudentExemptionFields1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD COLUMN IF NOT EXISTS "exemptionType" character varying,
      ADD COLUMN IF NOT EXISTS "exemptionAmount" numeric(10,2),
      ADD COLUMN IF NOT EXISTS "exemptionPercent" numeric(5,2),
      ADD COLUMN IF NOT EXISTS "exemptionDescription" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      DROP COLUMN IF EXISTS "exemptionPercent",
      DROP COLUMN IF EXISTS "exemptionAmount",
      DROP COLUMN IF EXISTS "exemptionType"
    `);
  }
}
