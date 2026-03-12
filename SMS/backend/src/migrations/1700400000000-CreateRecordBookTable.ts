import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateRecordBookTable1700400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('record_books');
    
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'record_books',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()'
            },
            {
              name: 'studentId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'teacherId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'classId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'term',
              type: 'varchar',
              length: '50',
              isNullable: false
            },
            {
              name: 'year',
              type: 'varchar',
              length: '10',
              isNullable: false
            },
            {
              name: 'test1',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: true
            },
            {
              name: 'test1Topic',
              type: 'varchar',
              length: '100',
              isNullable: true
            },
            {
              name: 'test2',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: true
            },
            {
              name: 'test2Topic',
              type: 'varchar',
              length: '100',
              isNullable: true
            },
            {
              name: 'test3',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: true
            },
            {
              name: 'test3Topic',
              type: 'varchar',
              length: '100',
              isNullable: true
            },
            {
              name: 'test4',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: true
            },
            {
              name: 'test4Topic',
              type: 'varchar',
              length: '100',
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
      console.log('✓ Created record_books table');
    } else {
      console.log('✓ record_books table already exists');
    }

    // Check if unique index already exists
    const table = await queryRunner.getTable('record_books');
    if (table) {
      const indexExists = table.indices.find(
        idx => idx.name === 'IDX_RECORD_BOOK_UNIQUE' || 
               idx.name === 'IDX_record_books_studentId_teacherId_classId_term_year'
      );
      
      if (!indexExists) {
        await queryRunner.createIndex(
          'record_books',
          new TableIndex({
            name: 'IDX_RECORD_BOOK_UNIQUE',
            columnNames: ['studentId', 'teacherId', 'classId', 'term', 'year'],
            isUnique: true
          })
        );
        console.log('✓ Created unique index');
      } else {
        console.log('✓ Unique index already exists');
      }

      // Create foreign keys with explicit names and check if they exist
      const fkStudentExists = table.foreignKeys.find(
        fk => fk.columnNames.includes('studentId') && fk.referencedTableName === 'students'
      );
      
      if (!fkStudentExists) {
        await queryRunner.createForeignKey(
          'record_books',
          new TableForeignKey({
            name: 'FK_record_books_student',
            columnNames: ['studentId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'students',
            onDelete: 'CASCADE'
          })
        );
        console.log('✓ Created foreign key for studentId');
      } else {
        console.log('✓ Foreign key for studentId already exists');
      }

      const fkTeacherExists = table.foreignKeys.find(
        fk => fk.columnNames.includes('teacherId') && fk.referencedTableName === 'teachers'
      );
      
      if (!fkTeacherExists) {
        await queryRunner.createForeignKey(
          'record_books',
          new TableForeignKey({
            name: 'FK_record_books_teacher',
            columnNames: ['teacherId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'teachers',
            onDelete: 'CASCADE'
          })
        );
        console.log('✓ Created foreign key for teacherId');
      } else {
        console.log('✓ Foreign key for teacherId already exists');
      }

      const fkClassExists = table.foreignKeys.find(
        fk => fk.columnNames.includes('classId') && fk.referencedTableName === 'classes'
      );
      
      if (!fkClassExists) {
        await queryRunner.createForeignKey(
          'record_books',
          new TableForeignKey({
            name: 'FK_record_books_class',
            columnNames: ['classId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'classes',
            onDelete: 'CASCADE'
          })
        );
        console.log('✓ Created foreign key for classId');
      } else {
        console.log('✓ Foreign key for classId already exists');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('record_books');
  }
}

