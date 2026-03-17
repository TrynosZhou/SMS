import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTimetableFieldsToSettings1774000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add schoolStartTime
    await queryRunner.addColumn(
      'settings',
      new TableColumn({
        name: 'schoolStartTime',
        type: 'time',
        isNullable: true
      })
    );

    // Add schoolEndTime
    await queryRunner.addColumn(
      'settings',
      new TableColumn({
        name: 'schoolEndTime',
        type: 'time',
        isNullable: true
      })
    );

    // Add breakTimes
    await queryRunner.addColumn(
      'settings',
      new TableColumn({
        name: 'breakTimes',
        type: 'json',
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('settings', 'breakTimes');
    await queryRunner.dropColumn('settings', 'schoolEndTime');
    await queryRunner.dropColumn('settings', 'schoolStartTime');
  }
}

