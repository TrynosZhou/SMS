import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateLoanSchedules1776300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'loan_schedules',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'teacherId', type: 'uuid', isNullable: true },
          { name: 'ancillaryStaffId', type: 'uuid', isNullable: true },
          { name: 'totalAmount', type: 'decimal', precision: 12, scale: 2 },
          { name: 'tenureMonths', type: 'int' },
          { name: 'amountPaid', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    const addFk = async (table: string, fk: TableForeignKey) => {
      try {
        await queryRunner.createForeignKey(table, fk);
      } catch (e: any) {
        if (e?.code !== '42710') throw e;
      }
    };
    await addFk('loan_schedules', new TableForeignKey({
      columnNames: ['teacherId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'teachers',
      onDelete: 'CASCADE',
    }));
    await addFk('loan_schedules', new TableForeignKey({
      columnNames: ['ancillaryStaffId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'ancillary_staff',
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('loan_schedules', true);
  }
}
