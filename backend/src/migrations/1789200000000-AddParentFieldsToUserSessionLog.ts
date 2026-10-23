import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores parent display name and linked children on session logs.
 */
export class AddParentFieldsToUserSessionLog1789200000000 implements MigrationInterface {
  name = 'AddParentFieldsToUserSessionLog1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const candidates = ['user_session_log', 'UserSessionLog'];
    for (const table of candidates) {
      if (!(await queryRunner.hasTable(table))) continue;
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "displayName" character varying(160)`
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "linkedChildren" text`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const candidates = ['user_session_log', 'UserSessionLog'];
    for (const table of candidates) {
      if (!(await queryRunner.hasTable(table))) continue;
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "linkedChildren"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "displayName"`);
    }
  }
}
