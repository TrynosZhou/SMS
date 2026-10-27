/**
 * One-off script: creates the `report_card_views` table directly via SQL.
 *
 * This exists because the project's migration chain (`npm run migrate-all`)
 * is currently blocked by a pre-existing failure in an older migration
 * (AddMoreTestsToRecordBook1700410000000 — "column test5 already exists").
 * Running that chain never reaches the newer CreateReportCardViews migration.
 *
 * The statement is idempotent (CREATE TABLE IF NOT EXISTS) and matches the
 * migration at src/migrations/1789300000000-CreateReportCardViews.ts exactly,
 * so it is safe to run repeatedly and safe to coexist with the migration file.
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function run() {
  try {
    await AppDataSource.initialize();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
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
      console.log('✓ report_card_views table is ready (created or already existed).');
    } finally {
      await queryRunner.release();
    }
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('✗ Failed to create report_card_views table:', error?.message || error);
    process.exit(1);
  }
}

run();
