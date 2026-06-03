import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'smsdb',
  });

  await client.connect();

  const check = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'classLevels'`
  );

  if (check.rows.length === 0) {
    await client.query(`ALTER TABLE "settings" ADD COLUMN "classLevels" json`);
    console.log('✓ Added settings.classLevels column');
  } else {
    console.log('✓ settings.classLevels column already exists');
  }

  await client.end();
}

main().catch((err) => {
  console.error('✗ Failed:', err.message);
  process.exit(1);
});
