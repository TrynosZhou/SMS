import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `report_card_views` table used to track when a parent has
 * viewed a child's report card (per exam type + term). The unique constraint
 * enforces one view record per (parent, student, examType, term).
 */
export class CreateReportCardViews1789300000000 implements MigrationInterface {
  name = 'CreateReportCardViews1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_card_views" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parentId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "examType" character varying NOT NULL,
        "term" character varying NOT NULL,
        "viewerUserId" uuid,
        "viewedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_card_views" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_card_views_parent_student_exam_term"
          UNIQUE ("parentId", "studentId", "examType", "term"),
        CONSTRAINT "FK_report_card_views_parent"
          FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_report_card_views_student"
          FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_report_card_views_parent" ON "report_card_views" ("parentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_report_card_views_student" ON "report_card_views" ("studentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_report_card_views_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_report_card_views_parent"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_card_views"`);
  }
}
