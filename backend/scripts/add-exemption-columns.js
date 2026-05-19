require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smsdb',
  });
  await client.connect();
  await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "exemptionType" varchar');
  await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "exemptionAmount" numeric(10,2)');
  await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "exemptionPercent" numeric(5,2)');
  await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "exemptionDescription" text');
  await client.end();
  console.log('Exemption columns ready');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
