import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDateJoinedToTeachers1776400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "dateJoined" date`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "dateJoined"`);
  }
}
