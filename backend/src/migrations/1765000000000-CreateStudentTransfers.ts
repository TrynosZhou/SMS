import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateStudentTransfers1765000000000 implements MigrationInterface {
  private tableName = 'student_transfers';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: this.tableName,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          generationStrategy: 'uuid',
          default: 'uuid_generate_v4()'
        },
        {
          name: 'studentId',
          type: 'uuid',
          isNullable: false
        },
        {
          name: 'fromClassId',
          type: 'uuid',
          isNullable: true
        },
        {
          name: 'toClassId',
          type: 'uuid',
          isNullable: false
        },
        {
          name: 'reason',
          type: 'text',
          isNullable: true
        },
        {
          name: 'performedByUserId',
          type: 'uuid',
          isNullable: true
        },
        {
          name: 'status',
          type: 'varchar',
          default: `'completed'`
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
    }));

    await queryRunner.createForeignKey(this.tableName, new TableForeignKey({
      columnNames: ['studentId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'students',
      onDelete: 'CASCADE'
    }));

    await queryRunner.createForeignKey(this.tableName, new TableForeignKey({
      columnNames: ['fromClassId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'classes',
      onDelete: 'SET NULL'
    }));

    await queryRunner.createForeignKey(this.tableName, new TableForeignKey({
      columnNames: ['toClassId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'classes',
      onDelete: 'CASCADE'
    }));

    await queryRunner.createForeignKey(this.tableName, new TableForeignKey({
      columnNames: ['performedByUserId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'users',
      onDelete: 'SET NULL'
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(this.tableName);
  }
}

