import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function main() {
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  try {
    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "schoolWebsite" character varying
    `);
    console.log('✓ schoolWebsite column ready');

    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "schoolFacebookUrl" character varying
    `);
    console.log('✓ schoolFacebookUrl column ready');

    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "academicTerms" json
    `);
    console.log('✓ academicTerms column ready');

    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "emailSettings" json
    `);
    console.log('✓ emailSettings column ready');

    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "notificationSettings" json
    `);
    console.log('✓ notificationSettings column ready');

    await runner.query(`
      ALTER TABLE "settings"
      ADD COLUMN IF NOT EXISTS "securitySettings" json
    `);
    console.log('✓ securitySettings column ready');
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
