import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTeachingPeriodsToSubject1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'subjects',
      new TableColumn({
        name: 'teachingPeriods',
        type: 'integer',
        default: 0,
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('subjects', 'teachingPeriods');
  }
}

