import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdmissionTables1788000000000 implements MigrationInterface {
  name = 'CreateAdmissionTables1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admission_applications_applicationtype_enum" AS ENUM('new_admission', 'transfer');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admission_applications_status_enum" AS ENUM('pending', 'under_review', 'accepted', 'rejected');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admission_applications_submittedby_enum" AS ENUM('applicant', 'parent');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admission_documents_documenttype_enum" AS ENUM('birth_certificate', 'report_card', 'id_photo', 'medical_form', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admission_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "applicationNumber" character varying NOT NULL,
        "applicantUserId" uuid,
        "parentUserId" uuid,
        "submittedBy" "admission_applications_submittedby_enum" NOT NULL DEFAULT 'applicant',
        "applicationType" "admission_applications_applicationtype_enum" NOT NULL DEFAULT 'new_admission',
        "status" "admission_applications_status_enum" NOT NULL DEFAULT 'pending',
        "firstName" character varying NOT NULL,
        "lastName" character varying NOT NULL,
        "dateOfBirth" date,
        "gender" character varying,
        "address" text,
        "phone" character varying,
        "email" character varying,
        "previousSchool" character varying,
        "classApplyingForId" uuid,
        "gradeApplyingFor" character varying,
        "guardianName" character varying,
        "guardianRelationship" character varying,
        "guardianPhone" character varying,
        "guardianEmail" character varying,
        "guardianAddress" text,
        "academicNotes" text,
        "reviewNotes" text,
        "reviewedByUserId" uuid,
        "reviewedAt" TIMESTAMP,
        "submittedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admission_applications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admission_applications_number" UNIQUE ("applicationNumber")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admission_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "applicationId" uuid NOT NULL,
        "documentType" "admission_documents_documenttype_enum" NOT NULL,
        "originalFilename" character varying NOT NULL,
        "storedPath" character varying NOT NULL,
        "mimeType" character varying,
        "fileSize" integer NOT NULL DEFAULT 0,
        "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admission_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admission_documents_application" FOREIGN KEY ("applicationId")
          REFERENCES "admission_applications"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admission_applications_status" ON "admission_applications" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admission_applications_applicant" ON "admission_applications" ("applicantUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admission_applications_parent" ON "admission_applications" ("parentUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admission_documents_app" ON "admission_documents" ("applicationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admission_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admission_applications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admission_documents_documenttype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admission_applications_submittedby_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admission_applications_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admission_applications_applicationtype_enum"`);
  }
}
