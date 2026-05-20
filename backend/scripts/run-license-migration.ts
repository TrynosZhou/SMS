import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { CreateLicenseSystem1778000000000 } from '../src/migrations/1778000000000-CreateLicenseSystem';
import { AssignPlatinumLicenseRollout1778000000001 } from '../src/migrations/1778000000001-AssignPlatinumLicenseRollout';

const MIGRATIONS: Array<{ timestamp: number; instance: { name: string; up: (r: any) => Promise<void> } }> = [
  { timestamp: 1778000000000, instance: new CreateLicenseSystem1778000000000() },
  { timestamp: 1778000000001, instance: new AssignPlatinumLicenseRollout1778000000001() }
];

async function main() {
  try {
    console.log('Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const runner = AppDataSource.createQueryRunner();
    await runner.connect();

    for (const { timestamp, instance } of MIGRATIONS) {
      const existing = await runner.query(
        `SELECT 1 FROM "migrations" WHERE "name" = $1 LIMIT 1`,
        [instance.name]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        console.log(`⊘ Skipping (already applied): ${instance.name}`);
        continue;
      }

      await runner.startTransaction();
      try {
        console.log(`Running migration: ${instance.name}`);
        await instance.up(runner);
        await runner.query(`INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`, [
          timestamp,
          instance.name
        ]);
        await runner.commitTransaction();
        console.log(`✓ Completed: ${instance.name}`);
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    }

    await runner.release();
    await AppDataSource.destroy();
    console.log('✓ License migrations finished');
    process.exit(0);
  } catch (error: any) {
    console.error('✗ License migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
