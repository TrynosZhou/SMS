import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateTimetableTables1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create timetables table
    await queryRunner.createTable(
      new Table({
        name: 'timetables',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'term',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'academicYear',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'startDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'endDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Create timetable_entries table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_entries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'timetableId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'day',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'period',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'room',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'classId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'teacherId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'subjectId',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Add foreign key for timetableId
    await queryRunner.createForeignKey(
      'timetable_entries',
      new TableForeignKey({
        columnNames: ['timetableId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'timetables',
        onDelete: 'CASCADE',
      })
    );

    // Add foreign key for classId (optional)
    await queryRunner.createForeignKey(
      'timetable_entries',
      new TableForeignKey({
        columnNames: ['classId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'classes',
        onDelete: 'SET NULL',
      })
    );

    // Add foreign key for teacherId (optional)
    await queryRunner.createForeignKey(
      'timetable_entries',
      new TableForeignKey({
        columnNames: ['teacherId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'teachers',
        onDelete: 'SET NULL',
      })
    );

    // Add foreign key for subjectId (optional)
    await queryRunner.createForeignKey(
      'timetable_entries',
      new TableForeignKey({
        columnNames: ['subjectId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'subjects',
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const timetableEntriesTable = await queryRunner.getTable('timetable_entries');
    if (timetableEntriesTable) {
      const foreignKeys = timetableEntriesTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('timetable_entries', fk);
      }
    }

    // Drop tables
    await queryRunner.dropTable('timetable_entries');
    await queryRunner.dropTable('timetables');
  }
}

