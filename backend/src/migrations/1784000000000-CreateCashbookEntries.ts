import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashbookEntries1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashbook_entries_entryDate" ON "cashbook_entries" ("entryDate", "createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cashbook_entries_entryDate"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cashbook_entries"`);
  }
}
