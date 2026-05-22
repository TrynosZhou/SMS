import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolWebsiteToSettings1778100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    const column = table?.findColumnByName('schoolWebsite');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "settings"
        ADD COLUMN "schoolWebsite" character varying
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings"
      DROP COLUMN IF EXISTS "schoolWebsite"
    `);
  }
}
