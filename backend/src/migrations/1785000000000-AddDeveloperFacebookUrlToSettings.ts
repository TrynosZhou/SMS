import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeveloperFacebookUrlToSettings1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    const column = table?.findColumnByName('developerFacebookUrl');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "settings"
        ADD COLUMN "developerFacebookUrl" character varying
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings"
      DROP COLUMN IF EXISTS "developerFacebookUrl"
    `);
  }
}
