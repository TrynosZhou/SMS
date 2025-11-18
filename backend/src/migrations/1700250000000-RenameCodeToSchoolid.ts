import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameCodeToSchoolid1700250000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if 'code' column exists before renaming
    const codeColumnExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schools' AND column_name = 'code'
    `);
    
    if (codeColumnExists.length > 0) {
      // Rename the 'code' column to 'schoolid' in the schools table
      await queryRunner.query(`
        ALTER TABLE schools 
        RENAME COLUMN "code" TO "schoolid";
      `);
      
      // Update the unique index if it exists
      await queryRunner.query(`
        DROP INDEX IF EXISTS "UQ_schools_code";
      `);
    }
    
    // Create unique index if it doesn't exist
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_schools_schoolid" 
      ON schools("schoolid");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: rename 'schoolid' back to 'code'
    await queryRunner.query(`
      ALTER TABLE schools 
      RENAME COLUMN "schoolid" TO "code";
    `);
    
    // Revert the unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_schools_schoolid";
    `);
    
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_schools_code" 
      ON schools("code");
    `);
  }
}

