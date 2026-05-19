import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function runMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    console.log('Running migrations...');
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('No pending migrations to run');
    } else {
      console.log(`Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    console.log('Migration process completed');
    process.exit(0);
  } catch (error: any) {
    console.error('Error running migration:', error);
    process.exit(1);
  }
}

runMigration();

