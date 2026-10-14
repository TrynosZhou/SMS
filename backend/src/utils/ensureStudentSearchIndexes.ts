import { AppDataSource } from '../config/database';

const SEARCH_EXPRESSION = `COALESCE("firstName", '') || ' ' || COALESCE("lastName", '') || ' ' || COALESCE("studentNumber", '') || ' ' || COALESCE("contactNumber", "phoneNumber", '')`;
const INDEX_NAME = 'idx_students_search_trgm';

export async function ensureStudentSearchIndexes(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    return;
  }
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    const indexExists = await queryRunner.query(
      `SELECT to_regclass($1) AS idx`,
      [`public.${INDEX_NAME}`]
    );
    if (!indexExists?.[0]?.idx) {
      await queryRunner.query(
        `CREATE INDEX "${INDEX_NAME}" ON students USING gin ((${SEARCH_EXPRESSION}) gin_trgm_ops)`
      );
      console.log(`[Server] ✓ Created trigram search index "${INDEX_NAME}" on students`);
    }
  } catch (err: any) {
    console.warn(`[Server] ⚠️ Student search index setup skipped:`, err?.message || err);
  } finally {
    await queryRunner.release();
  }
}
