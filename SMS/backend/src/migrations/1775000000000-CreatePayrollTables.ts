import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreatePayrollTables1775000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ancillary_staff table
    await queryRunner.createTable(
      new Table({
        name: 'ancillary_staff',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'employeeId', type: 'varchar', isUnique: true },
          { name: 'firstName', type: 'varchar' },
          { name: 'lastName', type: 'varchar' },
          { name: 'role', type: 'varchar', isNullable: true },
          { name: 'designation', type: 'varchar', isNullable: true },
          { name: 'department', type: 'varchar', isNullable: true },
          { name: 'salaryType', type: 'varchar', default: "'monthly'" },
          { name: 'bankName', type: 'varchar', isNullable: true },
          { name: 'bankAccountNumber', type: 'varchar', isNullable: true },
          { name: 'bankBranch', type: 'varchar', isNullable: true },
          { name: 'employmentStatus', type: 'varchar', default: "'active'" },
          { name: 'phoneNumber', type: 'varchar', isNullable: true },
          { name: 'dateJoined', type: 'date', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    // Create salary_structures table
    await queryRunner.createTable(
      new Table({
        name: 'salary_structures',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'name', type: 'varchar' },
          { name: 'employeeCategory', type: 'varchar' },
          { name: 'components', type: 'json' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    // Create salary_assignments table
    await queryRunner.createTable(
      new Table({
        name: 'salary_assignments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'teacherId', type: 'uuid', isNullable: true },
          { name: 'ancillaryStaffId', type: 'uuid', isNullable: true },
          { name: 'salaryStructureId', type: 'uuid' },
          { name: 'effectiveFrom', type: 'date' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    const addFkIfNotExists = async (table: string, fk: TableForeignKey) => {
      try {
        await queryRunner.createForeignKey(table, fk);
      } catch (e: any) {
        if (e?.code !== '42710') throw e; // 42710 = duplicate_object
      }
    };
    await addFkIfNotExists('salary_assignments', new TableForeignKey({
      columnNames: ['teacherId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'teachers',
      onDelete: 'CASCADE',
    }));
    await addFkIfNotExists('salary_assignments', new TableForeignKey({
      columnNames: ['ancillaryStaffId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'ancillary_staff',
      onDelete: 'CASCADE',
    }));
    await addFkIfNotExists('salary_assignments', new TableForeignKey({
      columnNames: ['salaryStructureId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'salary_structures',
      onDelete: 'CASCADE',
    }));

    // Create payroll_runs table
    await queryRunner.createTable(
      new Table({
        name: 'payroll_runs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'month', type: 'int' },
          { name: 'year', type: 'int' },
          { name: 'status', type: 'varchar', default: "'draft'" },
          { name: 'totalGross', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'totalNet', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    // Create payroll_entries table
    await queryRunner.createTable(
      new Table({
        name: 'payroll_entries',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'payrollRunId', type: 'uuid' },
          { name: 'teacherId', type: 'uuid', isNullable: true },
          { name: 'ancillaryStaffId', type: 'uuid', isNullable: true },
          { name: 'grossSalary', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'totalAllowances', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'totalDeductions', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'netSalary', type: 'decimal', precision: 12, scale: 2, default: 0 },
        ],
      }),
      true
    );

    await addFkIfNotExists('payroll_entries', new TableForeignKey({
      columnNames: ['payrollRunId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'payroll_runs',
      onDelete: 'CASCADE',
    }));
    await addFkIfNotExists('payroll_entries', new TableForeignKey({
      columnNames: ['teacherId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'teachers',
      onDelete: 'SET NULL',
    }));
    await addFkIfNotExists('payroll_entries', new TableForeignKey({
      columnNames: ['ancillaryStaffId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'ancillary_staff',
      onDelete: 'SET NULL',
    }));

    // Create payroll_entry_lines table
    await queryRunner.createTable(
      new Table({
        name: 'payroll_entry_lines',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'payrollEntryId', type: 'uuid' },
          { name: 'componentName', type: 'varchar' },
          { name: 'componentType', type: 'varchar' },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
        ],
      }),
      true
    );

    await addFkIfNotExists('payroll_entry_lines', new TableForeignKey({
      columnNames: ['payrollEntryId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'payroll_entries',
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order
    const payrollEntryLinesTable = await queryRunner.getTable('payroll_entry_lines');
    if (payrollEntryLinesTable) {
      for (const fk of payrollEntryLinesTable.foreignKeys) {
        await queryRunner.dropForeignKey('payroll_entry_lines', fk);
      }
    }
    await queryRunner.dropTable('payroll_entry_lines');

    const payrollEntriesTable = await queryRunner.getTable('payroll_entries');
    if (payrollEntriesTable) {
      for (const fk of payrollEntriesTable.foreignKeys) {
        await queryRunner.dropForeignKey('payroll_entries', fk);
      }
    }
    await queryRunner.dropTable('payroll_entries');

    await queryRunner.dropTable('payroll_runs');

    const salaryAssignmentsTable = await queryRunner.getTable('salary_assignments');
    if (salaryAssignmentsTable) {
      for (const fk of salaryAssignmentsTable.foreignKeys) {
        await queryRunner.dropForeignKey('salary_assignments', fk);
      }
    }
    await queryRunner.dropTable('salary_assignments');

    await queryRunner.dropTable('salary_structures');
    await queryRunner.dropTable('ancillary_staff');
  }
}
