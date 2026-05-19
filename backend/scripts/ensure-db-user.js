/**
 * Ensures DB_USERNAME exists with DB_PASSWORD (connects as postgres superuser).
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const dbName = process.env.DB_NAME || 'smsdb';
  const targetUser = process.env.DB_USERNAME || 'postgres';
  const targetPass = process.env.DB_PASSWORD || '';

  const adminUser = process.env.PG_SUPERUSER || 'postgres';
  const adminPass = process.env.PG_SUPERPASSWORD || process.env.DB_PASSWORD || 'admin';

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: adminUser,
    password: adminPass,
    database: 'postgres',
  });

  await client.connect();

  const safePass = String(targetPass).replace(/'/g, "''");
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [targetUser]);
  if (exists.rows.length === 0) {
    await client.query(
      `CREATE ROLE "${targetUser}" WITH LOGIN PASSWORD '${safePass}' CREATEDB`
    );
    console.log(`Created role: ${targetUser}`);
  } else {
    await client.query(`ALTER ROLE "${targetUser}" WITH LOGIN PASSWORD '${safePass}'`);
    console.log(`Updated password for role: ${targetUser}`);
  }

  await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${targetUser}"`);
  await client.end();

  const dbClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: adminUser,
    password: adminPass,
    database: dbName,
  });
  await dbClient.connect();
  await dbClient.query(`GRANT ALL ON SCHEMA public TO "${targetUser}"`);
  await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${targetUser}"`);
  await dbClient.end();

  console.log(`✓ User "${targetUser}" can access database "${dbName}"`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
