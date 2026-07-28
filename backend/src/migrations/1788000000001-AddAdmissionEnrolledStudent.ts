import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdmissionEnrolledStudent1788000000001 implements MigrationInterface {
  name = 'AddAdmissionEnrolledStudent1788000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admission_applications"
      ADD COLUMN IF NOT EXISTS "enrolledStudentId" uuid,
      ADD COLUMN IF NOT EXISTS "enrolledAt" TIMESTAMP
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "admission_applications"
          ADD CONSTRAINT "FK_admission_enrolled_student"
          FOREIGN KEY ("enrolledStudentId") REFERENCES "students"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admission_applications" DROP CONSTRAINT IF EXISTS "FK_admission_enrolled_student"
    `);
    await queryRunner.query(`
      ALTER TABLE "admission_applications"
      DROP COLUMN IF EXISTS "enrolledStudentId",
      DROP COLUMN IF EXISTS "enrolledAt"
    `);
  }
}
