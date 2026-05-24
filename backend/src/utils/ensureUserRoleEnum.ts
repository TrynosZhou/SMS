import { AppDataSource } from '../config/database';

const NEW_ROLE_VALUES = ['director', 'headmaster', 'deputy_headmaster'] as const;

/** Add new UserRole enum values when migrations did not run (PostgreSQL). */
export async function ensureUserRoleEnumValues(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const rows: Array<{ typname: string }> = await AppDataSource.query(
    `SELECT t.typname
     FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     JOIN pg_attribute a ON a.atttypid = t.oid
     JOIN pg_class c ON a.attrelid = c.oid
     WHERE c.relname = 'users' AND a.attname = 'role'
     LIMIT 1`
  );

  const enumName = rows[0]?.typname || 'users_role_enum';

  for (const val of NEW_ROLE_VALUES) {
    try {
      await AppDataSource.query(`
        DO $$ BEGIN
          ALTER TYPE "${enumName}" ADD VALUE '${val}';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    } catch (err: any) {
      console.warn(`[ensureUserRoleEnum] Could not add enum value "${val}":`, err?.message);
    }
  }
}
