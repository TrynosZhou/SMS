import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { CreateTeacherAppraisalTables1787000000000 } from '../src/migrations/1787000000000-CreateTeacherAppraisalTables';

async function runAppraisalMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const migration = new CreateTeacherAppraisalTables1787000000000();
      console.log('Running CreateTeacherAppraisalTables migration...');
      await migration.up(queryRunner);
      try {
        await queryRunner.query(
          `INSERT INTO migrations ("timestamp", "name") VALUES (1787000000000, 'CreateTeacherAppraisalTables1787000000000')`
        );
      } catch (_) {}

      const [cycle] = await queryRunner.query(
        `SELECT "name", "startDate", "endDate", "status" FROM "appraisal_cycles" ORDER BY "createdAt" ASC LIMIT 1`
      );
      const [{ count }] = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM "appraisal_criteria"`);
      console.log(`Criteria available: ${count}`);
      if (cycle) {
        console.log(`Cycle: ${cycle.name} (${cycle.startDate} → ${cycle.endDate}) [${cycle.status}]`);
      }
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('Teacher appraisal tables ready');
    process.exit(0);
  } catch (error: any) {
    console.error('Error running appraisal migration:', error);
    process.exit(1);
  }
}

runAppraisalMigration();
