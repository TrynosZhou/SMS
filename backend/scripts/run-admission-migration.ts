import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { CreateAdmissionTables1788000000000 } from '../src/migrations/1788000000000-CreateAdmissionTables';
import { AddAdmissionEnrolledStudent1788000000001 } from '../src/migrations/1788000000001-AddAdmissionEnrolledStudent';

async function runAdmissionMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const migration = new CreateAdmissionTables1788000000000();
      console.log('Running CreateAdmissionTables migration...');
      await migration.up(queryRunner);
      try {
        await queryRunner.query(
          `INSERT INTO migrations ("timestamp", "name") VALUES (1788000000000, 'CreateAdmissionTables1788000000000')`
        );
      } catch (_) {
        /* already recorded */
      }

      const migration2 = new AddAdmissionEnrolledStudent1788000000001();
      console.log('Running AddAdmissionEnrolledStudent migration...');
      await migration2.up(queryRunner);
      try {
        await queryRunner.query(
          `INSERT INTO migrations ("timestamp", "name") VALUES (1788000000001, 'AddAdmissionEnrolledStudent1788000000001')`
        );
      } catch (_) {
        /* already recorded */
      }
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('Admission tables ready');
    process.exit(0);
  } catch (error: any) {
    console.error('Error running admission migration:', error);
    process.exit(1);
  }
}

runAdmissionMigration();
