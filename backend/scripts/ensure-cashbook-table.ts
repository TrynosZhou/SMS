import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function main() {
  await AppDataSource.initialize();
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "cashbook_entries" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "entryDate" date NOT NULL,
      "type" character varying NOT NULL,
      "description" text NOT NULL,
      "moneyIn" numeric(10,2) NOT NULL DEFAULT 0,
      "moneyOut" numeric(10,2) NOT NULL DEFAULT 0,
      "paymentMethod" character varying,
      "reference" character varying,
      "source" character varying NOT NULL DEFAULT 'manual',
      "paymentLogId" character varying,
      "createdById" uuid,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cashbook_entries" PRIMARY KEY ("id")
    )
  `);
  await AppDataSource.query(
    `CREATE INDEX IF NOT EXISTS "IDX_cashbook_entries_entryDate" ON "cashbook_entries" ("entryDate", "createdAt")`
  );
  console.log('cashbook_entries table is ready');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
