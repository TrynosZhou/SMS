import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassLevelsToSettings1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    const column = table?.findColumnByName('classLevels');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "settings"
        ADD COLUMN "classLevels" json
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings"
      DROP COLUMN IF EXISTS "classLevels"
    `);
  }
}
