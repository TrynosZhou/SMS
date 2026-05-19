const { Client } = require('pg');
require('dotenv').config();

function createClient() {
  if (process.env.DATABASE_URL) {
    return new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
  }

  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sms_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
}

function isApplyMode() {
  return process.argv.includes('--apply');
}

const duplicatesSql = `
  SELECT
    "classId",
    term,
    type,
    COUNT(*)::int AS duplicate_count,
    ARRAY_AGG(id ORDER BY "createdAt" DESC, id DESC) AS exam_ids
  FROM exams
  GROUP BY "classId", term, type
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC, "classId", term, type;
`;

const deleteSql = `
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "classId", term, type
        ORDER BY "createdAt" DESC, id DESC
      ) AS rn
    FROM exams
  )
  DELETE FROM exams
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
`;

async function run() {
  const client = createClient();
  const apply = isApplyMode();

  try {
    await client.connect();
    console.log(apply ? 'APPLY mode: cleaning exam duplicates...' : 'DRY-RUN mode: listing exam duplicates...');

    const before = await client.query(duplicatesSql);
    const groups = before.rows || [];

    if (groups.length === 0) {
      console.log('No duplicate exam keys found for (classId, term, type).');
      process.exit(0);
    }

    console.log(`Found ${groups.length} duplicate group(s):`);
    groups.forEach((row, idx) => {
      console.log('');
      console.log(`${idx + 1}. classId: ${row.classId}`);
      console.log(`   term: ${row.term}`);
      console.log(`   type: ${row.type}`);
      console.log(`   count: ${row.duplicate_count}`);
      console.log(`   keep: ${row.exam_ids[0]}`);
      console.log(`   delete: ${row.exam_ids.slice(1).join(', ')}`);
    });

    if (!apply) {
      console.log('\nNo changes made. Re-run with --apply to delete duplicates and keep latest rows.');
      process.exitCode = 2;
      return;
    }

    await client.query('BEGIN');
    const del = await client.query(deleteSql);
    await client.query('COMMIT');

    console.log(`\nDeleted ${del.rowCount || 0} duplicate exam row(s).`);

    const after = await client.query(duplicatesSql);
    if ((after.rows || []).length === 0) {
      console.log('Cleanup successful. No remaining duplicate keys.');
      process.exit(0);
      return;
    }

    console.log('Cleanup completed, but some duplicate groups remain. Please review manually.');
    process.exitCode = 3;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors when transaction wasn't started.
    }
    console.error('Failed to clean exam duplicates:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
