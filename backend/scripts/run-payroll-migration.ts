import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { CreatePayrollTables1775000000000 } from '../src/migrations/1775000000000-CreatePayrollTables';

async function runPayrollMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const migration = new CreatePayrollTables1775000000000();
      console.log('Running CreatePayrollTables migration...');
      await migration.up(queryRunner);
      try {
        await queryRunner.query(
          `INSERT INTO migrations ("timestamp", "name") VALUES (1775000000000, 'CreatePayrollTables1775000000000')`
        );
      } catch (_) {}
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('Payroll tables created successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('Error running payroll migration:', error);
    process.exit(1);
  }
}

runPayrollMigration();
