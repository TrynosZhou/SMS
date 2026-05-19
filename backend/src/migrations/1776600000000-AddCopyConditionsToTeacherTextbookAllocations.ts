import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopyConditionsToTeacherTextbookAllocations1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_teacher_textbook_allocations"
      ADD COLUMN IF NOT EXISTS "copyConditions" json
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_teacher_textbook_allocations"
      DROP COLUMN IF EXISTS "copyConditions"
    `);
  }
}
