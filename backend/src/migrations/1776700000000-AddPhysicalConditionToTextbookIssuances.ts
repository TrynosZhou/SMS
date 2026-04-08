import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhysicalConditionToTextbookIssuances1776700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_textbook_issuances"
      ADD COLUMN IF NOT EXISTS "physicalCondition" character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_textbook_issuances"
      DROP COLUMN IF EXISTS "physicalCondition"
    `);
  }
}
