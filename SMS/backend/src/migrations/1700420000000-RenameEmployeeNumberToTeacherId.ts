import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEmployeeNumberToTeacherId1700420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename column from employeeNumber to teacherId
    await queryRunner.query(`
      ALTER TABLE teachers 
      RENAME COLUMN "employeeNumber" TO "teacherId"
    `);

    console.log('✓ Renamed employeeNumber to teacherId');
    console.log('✓ Unique constraint automatically updated with column rename');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Rename back to employeeNumber
    await queryRunner.query(`
      ALTER TABLE teachers 
      RENAME COLUMN "teacherId" TO "employeeNumber"
    `);

    console.log('✓ Reverted teacherId back to employeeNumber');
  }
}

