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

async function checkExamDuplicates() {
  const client = createClient();

  const duplicatesQuery = `
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

  try {
    await client.connect();
    console.log('Connected to database. Checking duplicate exam keys...');

    const result = await client.query(duplicatesQuery);
    const rows = result.rows || [];

    if (rows.length === 0) {
      console.log('No duplicate exam keys found for (classId, term, type).');
      process.exit(0);
    }

    console.log(`Found ${rows.length} duplicate group(s):`);
    rows.forEach((row, index) => {
      console.log('');
      console.log(`${index + 1}. classId: ${row.classId}`);
      console.log(`   term: ${row.term}`);
      console.log(`   type: ${row.type}`);
      console.log(`   count: ${row.duplicate_count}`);
      console.log(`   ids: ${row.exam_ids.join(', ')}`);
    });

    process.exitCode = 2;
  } catch (error) {
    console.error('Failed to check exam duplicates:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkExamDuplicates();
