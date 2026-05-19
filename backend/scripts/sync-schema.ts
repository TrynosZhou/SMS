import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function syncSchema() {
  try {
    console.log('Connecting and synchronizing schema (entities → tables)...');
    await AppDataSource.initialize();
    console.log('✓ Schema synchronized from entities');

    const runMigrations = (process.env.RUN_MIGRATIONS || 'true').toLowerCase() !== 'false';
    if (runMigrations && !AppDataSource.options.synchronize) {
      console.log('Running pending migrations...');
      const ran = await AppDataSource.runMigrations();
      console.log(ran.length ? `✓ Ran ${ran.length} migration(s)` : '✓ No pending migrations');
    } else if (runMigrations && AppDataSource.options.synchronize) {
      console.log('Running pending migrations (after sync)...');
      try {
        const ran = await AppDataSource.runMigrations();
        console.log(ran.length ? `✓ Ran ${ran.length} migration(s)` : '✓ No pending migrations');
      } catch (err: any) {
        console.warn('⚠ Some migrations skipped or failed:', err?.message || err);
      }
    }

    const tables = await AppDataSource.query<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    console.log(`\n✓ ${tables.length} tables in public schema:`);
    tables.forEach((t) => console.log(`  - ${t.tablename}`));

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('✗ Schema sync failed:', error?.message || error);
    process.exit(1);
  }
}

syncSchema();
