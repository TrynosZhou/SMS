import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateEmployeeLoanAccounts1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'employee_loan_accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'teacherId', type: 'uuid', isNullable: true, isUnique: true },
          { name: 'ancillaryStaffId', type: 'uuid', isNullable: true, isUnique: true },
          { name: 'balance', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
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
    await addFk('employee_loan_accounts', new TableForeignKey({
      columnNames: ['teacherId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'teachers',
      onDelete: 'CASCADE',
    }));
    await addFk('employee_loan_accounts', new TableForeignKey({
      columnNames: ['ancillaryStaffId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'ancillary_staff',
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('employee_loan_accounts', true);
  }
}
