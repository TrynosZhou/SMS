import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchoolsTable1700300000000 implements MigrationInterface {
  name = 'CreateSchoolsTable1700300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "schoolid" character varying(64) NOT NULL,
        "logoUrl" text,
        "address" character varying(255),
        "phone" character varying(64),
        "isActive" boolean NOT NULL DEFAULT true,
        "subscriptionEndDate" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schools_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_schools_schoolid"
      ON "schools" ("schoolid")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_schools_schoolid"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schools"`);
  }
}

