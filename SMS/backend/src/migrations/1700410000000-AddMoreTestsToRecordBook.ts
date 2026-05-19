import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMoreTestsToRecordBook1700410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add test5 through test10 columns
    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test5',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test5Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test6',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test6Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test7',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test7Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test8',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test8Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test9',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test9Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test10',
      type: 'decimal',
      precision: 5,
      scale: 2,
      isNullable: true
    }));

    await queryRunner.addColumn('record_books', new TableColumn({
      name: 'test10Topic',
      type: 'varchar',
      length: '100',
      isNullable: true
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('record_books', 'test10Topic');
    await queryRunner.dropColumn('record_books', 'test10');
    await queryRunner.dropColumn('record_books', 'test9Topic');
    await queryRunner.dropColumn('record_books', 'test9');
    await queryRunner.dropColumn('record_books', 'test8Topic');
    await queryRunner.dropColumn('record_books', 'test8');
    await queryRunner.dropColumn('record_books', 'test7Topic');
    await queryRunner.dropColumn('record_books', 'test7');
    await queryRunner.dropColumn('record_books', 'test6Topic');
    await queryRunner.dropColumn('record_books', 'test6');
    await queryRunner.dropColumn('record_books', 'test5Topic');
    await queryRunner.dropColumn('record_books', 'test5');
  }
}

