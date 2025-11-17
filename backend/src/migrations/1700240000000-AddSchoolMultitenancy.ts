import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolMultitenancy1700240000000 implements MigrationInterface {
  name = 'AddSchoolMultitenancy1700240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "code" character varying(50) NOT NULL,
        "logoUrl" text,
        "address" character varying(255),
        "phone" character varying(50),
        "isActive" boolean NOT NULL DEFAULT true,
        "subscriptionEndDate" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schools_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_schools_code" UNIQUE ("code")
      )
    `);

    const defaultSchoolResult = await queryRunner.query(
      `
        INSERT INTO "schools" ("name", "code", "isActive")
        VALUES ('Default School', 'DEFAULT', true)
        ON CONFLICT ("code") DO UPDATE SET "updatedAt" = NOW()
        RETURNING "id"
      `
    );

    const defaultSchoolId = defaultSchoolResult?.[0]?.id;
    if (!defaultSchoolId) {
      throw new Error('Failed to create default school seed');
    }

    const tables = [
      { name: 'users', column: '"schoolId"', constraint: '"FK_users_school"' },
      { name: 'students', column: '"schoolId"', constraint: '"FK_students_school"' },
      { name: 'teachers', column: '"schoolId"', constraint: '"FK_teachers_school"' },
      { name: 'parents', column: '"schoolId"', constraint: '"FK_parents_school"' },
      { name: 'classes', column: '"schoolId"', constraint: '"FK_classes_school"' },
      { name: 'subjects', column: '"schoolId"', constraint: '"FK_subjects_school"' },
      { name: 'exams', column: '"schoolId"', constraint: '"FK_exams_school"' },
      { name: 'marks', column: '"schoolId"', constraint: '"FK_marks_school"' },
      { name: 'invoices', column: '"schoolId"', constraint: '"FK_invoices_school"' },
      { name: 'invoice_uniform_items', column: '"schoolId"', constraint: '"FK_invoice_uniform_items_school"' },
      { name: 'uniform_items', column: '"schoolId"', constraint: '"FK_uniform_items_school"' },
      { name: 'settings', column: '"schoolId"', constraint: '"FK_settings_school"' },
      { name: 'attendance', column: '"schoolId"', constraint: '"FK_attendance_school"' },
      { name: 'messages', column: '"schoolId"', constraint: '"FK_messages_school"' },
      { name: 'report_card_remarks', column: '"schoolId"', constraint: '"FK_report_card_remarks_school"' }
    ];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table.name}" ADD COLUMN IF NOT EXISTS ${table.column} uuid`);
      await queryRunner.query(
        `UPDATE "${table.name}" SET ${table.column} = $1 WHERE ${table.column} IS NULL`,
        [defaultSchoolId]
      );
      await queryRunner.query(`ALTER TABLE "${table.name}" ALTER COLUMN ${table.column} SET NOT NULL`);
      await queryRunner.query(
        `ALTER TABLE "${table.name}" DROP CONSTRAINT IF EXISTS ${table.constraint}`
      );
      await queryRunner.query(
        `ALTER TABLE "${table.name}" ADD CONSTRAINT ${table.constraint} FOREIGN KEY (${table.column}) REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_school" ON "users" ("email", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_school" ON "users" ("username", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_students_number_school" ON "students" ("studentNumber", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_teachers_employee_school" ON "teachers" ("employeeNumber", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_classes_name_school" ON "classes" ("name", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subjects_code_school" ON "subjects" ("code", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_uniform_items_name_school" ON "uniform_items" ("name", "schoolId")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settings_school" ON "settings" ("schoolId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      { name: 'report_card_remarks', column: '"schoolId"', constraint: '"FK_report_card_remarks_school"' },
      { name: 'messages', column: '"schoolId"', constraint: '"FK_messages_school"' },
      { name: 'attendance', column: '"schoolId"', constraint: '"FK_attendance_school"' },
      { name: 'settings', column: '"schoolId"', constraint: '"FK_settings_school"' },
      { name: 'uniform_items', column: '"schoolId"', constraint: '"FK_uniform_items_school"' },
      { name: 'invoice_uniform_items', column: '"schoolId"', constraint: '"FK_invoice_uniform_items_school"' },
      { name: 'invoices', column: '"schoolId"', constraint: '"FK_invoices_school"' },
      { name: 'marks', column: '"schoolId"', constraint: '"FK_marks_school"' },
      { name: 'exams', column: '"schoolId"', constraint: '"FK_exams_school"' },
      { name: 'subjects', column: '"schoolId"', constraint: '"FK_subjects_school"' },
      { name: 'classes', column: '"schoolId"', constraint: '"FK_classes_school"' },
      { name: 'parents', column: '"schoolId"', constraint: '"FK_parents_school"' },
      { name: 'teachers', column: '"schoolId"', constraint: '"FK_teachers_school"' },
      { name: 'students', column: '"schoolId"', constraint: '"FK_students_school"' },
      { name: 'users', column: '"schoolId"', constraint: '"FK_users_school"' }
    ];

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settings_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_uniform_items_name_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subjects_code_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_classes_name_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_teachers_employee_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_students_number_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username_school"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_school"`);

    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table.name}" DROP CONSTRAINT IF EXISTS ${table.constraint}`
      );
      await queryRunner.query(`ALTER TABLE "${table.name}" DROP COLUMN IF EXISTS ${table.column}`);
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "schools"`);
  }
}


