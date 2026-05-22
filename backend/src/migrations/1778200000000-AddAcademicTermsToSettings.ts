import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcademicTermsToSettings1778200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    const column = table?.findColumnByName('academicTerms');

    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "settings"
        ADD COLUMN "academicTerms" json
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings"
      DROP COLUMN IF EXISTS "academicTerms"
    `);
  }
}
