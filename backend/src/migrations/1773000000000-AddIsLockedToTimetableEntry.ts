import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsLockedToTimetableEntry1773000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'timetable_entries',
      new TableColumn({
        name: 'isLocked',
        type: 'boolean',
        default: false
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('timetable_entries', 'isLocked');
  }
}

