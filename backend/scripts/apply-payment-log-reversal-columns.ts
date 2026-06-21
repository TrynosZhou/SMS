import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function main() {
  await AppDataSource.initialize();

  await AppDataSource.query(`
    ALTER TABLE "payment_logs"
    ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "reversedByUserId" character varying,
    ADD COLUMN IF NOT EXISTS "reversalPaymentLogId" character varying,
    ADD COLUMN IF NOT EXISTS "reversesPaymentLogId" character varying
  `);

  await AppDataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_payment_logs_reversesPaymentLogId"
    ON "payment_logs" ("reversesPaymentLogId")
    WHERE "reversesPaymentLogId" IS NOT NULL
  `);

  const name = 'AddPaymentLogReversalFields1786000000000';
  const existing: Array<{ id: number }> = await AppDataSource.query(
    'SELECT id FROM migrations WHERE name = $1',
    [name]
  );
  if (!existing.length) {
    await AppDataSource.query('INSERT INTO migrations (timestamp, name) VALUES ($1, $2)', [
      1786000000000,
      name,
    ]);
  }

  console.log('Payment log reversal columns applied successfully');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
