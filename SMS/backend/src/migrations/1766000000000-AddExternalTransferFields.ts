import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddExternalTransferFields1766000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'student_transfers';

    // Add transferType column
    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'transferType',
      type: 'varchar',
      default: `'internal'`,
      isNullable: false
    }));

    // Make toClassId nullable (for external transfers)
    await queryRunner.query(`
      ALTER TABLE "${tableName}" 
      ALTER COLUMN "toClassId" DROP NOT NULL
    `);

    // Drop the existing foreign key constraint on toClassId
    const table = await queryRunner.getTable(tableName);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('toClassId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(tableName, foreignKey);
    }

    // Recreate the foreign key with ON DELETE SET NULL (since it can be null for external transfers)
    await queryRunner.createForeignKey(tableName, new TableForeignKey({
      columnNames: ['toClassId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'classes',
      onDelete: 'SET NULL'
    }));

    // Add external transfer fields
    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'externalSchoolName',
      type: 'varchar',
      isNullable: true
    }));

    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'externalSchoolAddress',
      type: 'text',
      isNullable: true
    }));

    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'externalSchoolPhone',
      type: 'varchar',
      isNullable: true
    }));

    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'externalSchoolEmail',
      type: 'varchar',
      isNullable: true
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'student_transfers';

    // Remove external transfer fields
    await queryRunner.dropColumn(tableName, 'externalSchoolEmail');
    await queryRunner.dropColumn(tableName, 'externalSchoolPhone');
    await queryRunner.dropColumn(tableName, 'externalSchoolAddress');
    await queryRunner.dropColumn(tableName, 'externalSchoolName');

    // Drop the foreign key constraint on toClassId
    const table = await queryRunner.getTable(tableName);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('toClassId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(tableName, foreignKey);
    }

    // Make toClassId NOT NULL again
    await queryRunner.query(`
      ALTER TABLE "${tableName}" 
      ALTER COLUMN "toClassId" SET NOT NULL
    `);

    // Recreate the foreign key with ON DELETE CASCADE
    await queryRunner.createForeignKey(tableName, new TableForeignKey({
      columnNames: ['toClassId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'classes',
      onDelete: 'CASCADE'
    }));

    // Remove transferType column
    await queryRunner.dropColumn(tableName, 'transferType');
  }
}

