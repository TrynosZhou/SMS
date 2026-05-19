import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNationalIdToTeachersAndAncillaryStaff1776100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "nationalId" varchar`);
    await queryRunner.query(`ALTER TABLE "ancillary_staff" ADD COLUMN IF NOT EXISTS "nationalId" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "nationalId"`);
    await queryRunner.query(`ALTER TABLE "ancillary_staff" DROP COLUMN IF EXISTS "nationalId"`);
  }
}
