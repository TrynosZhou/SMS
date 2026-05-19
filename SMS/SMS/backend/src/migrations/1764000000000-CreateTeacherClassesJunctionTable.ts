import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableUnique } from 'typeorm';

export class CreateTeacherClassesJunctionTable1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the teacher_classes junction table
    await queryRunner.createTable(
      new Table({
        name: 'teacher_classes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
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
          }
        ]
      }),
      true
    );

    // Add unique constraint on (teacherId, classId) to prevent duplicates
    await queryRunner.createUniqueConstraint(
      'teacher_classes',
      new TableUnique({
        name: 'UQ_teacher_classes_teacher_class',
        columnNames: ['teacherId', 'classId']
      })
    );

    // Add indexes for better query performance
    await queryRunner.createIndex(
      'teacher_classes',
      new TableIndex({
        name: 'IDX_teacher_classes_teacherId',
        columnNames: ['teacherId']
      })
    );

    await queryRunner.createIndex(
      'teacher_classes',
      new TableIndex({
        name: 'IDX_teacher_classes_classId',
        columnNames: ['classId']
      })
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'teacher_classes',
      new TableForeignKey({
        columnNames: ['teacherId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'teachers',
        onDelete: 'CASCADE',
        name: 'FK_teacher_classes_teacher'
      })
    );

    await queryRunner.createForeignKey(
      'teacher_classes',
      new TableForeignKey({
        columnNames: ['classId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'classes',
        onDelete: 'CASCADE',
        name: 'FK_teacher_classes_class'
      })
    );

    console.log('✓ Created teacher_classes junction table');
    console.log('✓ Added unique constraint on (teacherId, classId)');
    console.log('✓ Added indexes and foreign keys');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.dropForeignKey('teacher_classes', 'FK_teacher_classes_class');
    await queryRunner.dropForeignKey('teacher_classes', 'FK_teacher_classes_teacher');
    
    // Drop indexes
    await queryRunner.dropIndex('teacher_classes', 'IDX_teacher_classes_classId');
    await queryRunner.dropIndex('teacher_classes', 'IDX_teacher_classes_teacherId');
    
    // Drop unique constraint
    await queryRunner.dropUniqueConstraint('teacher_classes', 'UQ_teacher_classes_teacher_class');
    
    // Drop table
    await queryRunner.dropTable('teacher_classes');
    
    console.log('✓ Dropped teacher_classes junction table');
  }
}

