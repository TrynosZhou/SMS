import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamStudentPassRateInclusion1776500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_student_pass_rate_inclusion" (
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "includeInClassPassRate" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_exam_student_pass_rate_inclusion" PRIMARY KEY ("examId", "studentId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_student_pass_rate_inclusion"`);
  }
}
