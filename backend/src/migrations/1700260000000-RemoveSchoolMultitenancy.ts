import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSchoolMultitenancy1700260000000 implements MigrationInterface {
  name = 'RemoveSchoolMultitenancy1700260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // List of tables that had schoolId columns added
    const tables = [
      { name: 'users', constraint: '"FK_users_school"', indexes: ['IDX_users_email_school', 'IDX_users_username_school'] },
      { name: 'students', constraint: '"FK_students_school"', indexes: ['IDX_students_number_school'] },
      { name: 'teachers', constraint: '"FK_teachers_school"', indexes: ['IDX_teachers_employee_school'] },
      { name: 'parents', constraint: '"FK_parents_school"', indexes: [] },
      { name: 'classes', constraint: '"FK_classes_school"', indexes: ['IDX_classes_name_school'] },
      { name: 'subjects', constraint: '"FK_subjects_school"', indexes: ['IDX_subjects_code_school'] },
      { name: 'exams', constraint: '"FK_exams_school"', indexes: [] },
      { name: 'marks', constraint: '"FK_marks_school"', indexes: [] },
      { name: 'invoices', constraint: '"FK_invoices_school"', indexes: [] },
      { name: 'invoice_uniform_items', constraint: '"FK_invoice_uniform_items_school"', indexes: [] },
      { name: 'uniform_items', constraint: '"FK_uniform_items_school"', indexes: ['IDX_uniform_items_name_school'] },
      { name: 'settings', constraint: '"FK_settings_school"', indexes: ['IDX_settings_school'] },
      { name: 'attendance', constraint: '"FK_attendance_school"', indexes: [] },
      { name: 'messages', constraint: '"FK_messages_school"', indexes: [] },
      { name: 'report_card_remarks', constraint: '"FK_report_card_remarks_school"', indexes: [] }
    ];

    // Remove indexes first
    for (const table of tables) {
      for (const index of table.indexes) {
        await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
      }
    }

    // Remove foreign key constraints and then the columns
    for (const table of tables) {
      // Drop foreign key constraint
      await queryRunner.query(
        `ALTER TABLE "${table.name}" DROP CONSTRAINT IF EXISTS ${table.constraint}`
      );
      
      // Drop the schoolId column
      await queryRunner.query(
        `ALTER TABLE "${table.name}" DROP COLUMN IF EXISTS "schoolId"`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration removes multitenancy, so we don't provide a down migration
    // If you need to restore multitenancy, you would need to re-run the AddSchoolMultitenancy migration
    throw new Error('Cannot revert removal of multitenancy. Use AddSchoolMultitenancy migration to restore.');
  }
}

