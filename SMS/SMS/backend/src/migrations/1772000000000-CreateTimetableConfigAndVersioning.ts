import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class CreateTimetableConfigAndVersioning1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create timetable_configs table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'periodsPerDay',
            type: 'integer',
            default: 7
          },
          {
            name: 'schoolStartTime',
            type: 'time',
            default: "'08:00:00'"
          },
          {
            name: 'schoolEndTime',
            type: 'time',
            default: "'15:00:00'"
          },
          {
            name: 'periodDuration',
            type: 'integer',
            default: 40
          },
          {
            name: 'breakPeriods',
            type: 'json',
            isNullable: true
          },
          {
            name: 'daysOfWeek',
            type: 'json',
            default: "'[\"Monday\",\"Tuesday\",\"Wednesday\",\"Thursday\",\"Friday\"]'"
          },
          {
            name: 'preferences',
            type: 'json',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Add configId to timetables table
    await queryRunner.addColumn(
      'timetables',
      new TableColumn({
        name: 'configId',
        type: 'uuid',
        isNullable: true
      })
    );

    // Create foreign key for configId
    await queryRunner.createForeignKey(
      'timetables',
      new TableForeignKey({
        columnNames: ['configId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'timetable_configs',
        onDelete: 'SET NULL'
      })
    );

    // Create timetable_versions table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'timetableId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'versionNumber',
            type: 'integer',
            isNullable: false
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: false
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Create foreign key for timetable_versions
    await queryRunner.createForeignKey(
      'timetable_versions',
      new TableForeignKey({
        columnNames: ['timetableId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'timetables',
        onDelete: 'CASCADE'
      })
    );

    // Create timetable_change_logs table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_change_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'versionId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'action',
            type: 'varchar',
            isNullable: false
          },
          {
            name: 'oldValue',
            type: 'json',
            isNullable: false
          },
          {
            name: 'newValue',
            type: 'json',
            isNullable: false
          },
          {
            name: 'changedBy',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'reason',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Create foreign key for timetable_change_logs
    await queryRunner.createForeignKey(
      'timetable_change_logs',
      new TableForeignKey({
        columnNames: ['versionId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'timetable_versions',
        onDelete: 'CASCADE'
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const timetableChangeLogsTable = await queryRunner.getTable('timetable_change_logs');
    const changeLogsForeignKey = timetableChangeLogsTable?.foreignKeys.find(
      fk => fk.columnNames.indexOf('versionId') !== -1
    );
    if (changeLogsForeignKey) {
      await queryRunner.dropForeignKey('timetable_change_logs', changeLogsForeignKey);
    }

    const timetableVersionsTable = await queryRunner.getTable('timetable_versions');
    const versionsForeignKey = timetableVersionsTable?.foreignKeys.find(
      fk => fk.columnNames.indexOf('timetableId') !== -1
    );
    if (versionsForeignKey) {
      await queryRunner.dropForeignKey('timetable_versions', versionsForeignKey);
    }

    const timetablesTable = await queryRunner.getTable('timetables');
    const configForeignKey = timetablesTable?.foreignKeys.find(
      fk => fk.columnNames.indexOf('configId') !== -1
    );
    if (configForeignKey) {
      await queryRunner.dropForeignKey('timetables', configForeignKey);
    }

    // Drop tables
    await queryRunner.dropTable('timetable_change_logs');
    await queryRunner.dropTable('timetable_versions');
    
    // Drop configId column
    await queryRunner.dropColumn('timetables', 'configId');
    
    await queryRunner.dropTable('timetable_configs');
  }
}

