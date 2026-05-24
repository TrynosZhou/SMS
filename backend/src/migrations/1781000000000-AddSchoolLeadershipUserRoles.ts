import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolLeadershipUserRoles1781000000000 implements MigrationInterface {
  name = 'AddSchoolLeadershipUserRoles1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ typname: string }> = await queryRunner.query(
      `SELECT t.typname
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_attribute a ON a.atttypid = t.oid
       JOIN pg_class c ON a.attrelid = c.oid
       WHERE c.relname = 'users' AND a.attname = 'role'
       LIMIT 1`
    );
    const enumName = rows[0]?.typname || 'users_role_enum';

    for (const val of ['director', 'headmaster', 'deputy_headmaster']) {
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TYPE "${enumName}" ADD VALUE '${val}';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove enum values safely; no-op
  }
}
