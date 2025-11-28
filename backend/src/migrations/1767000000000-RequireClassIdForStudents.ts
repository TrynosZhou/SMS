import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RequireClassIdForStudents1767000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const studentsTable = 'students';
    const classesTable = 'classes';

    // Step 1: Find students without a classId
    const studentsWithoutClass = await queryRunner.query(`
      SELECT id, "firstName", "lastName", "studentNumber"
      FROM "${studentsTable}"
      WHERE "classId" IS NULL
    `);

    console.log(`Found ${studentsWithoutClass.length} students without a class assignment`);

    if (studentsWithoutClass.length > 0) {
      // Step 2: Find the first active class to assign to unassigned students
      const defaultClass = await queryRunner.query(`
        SELECT id, name
        FROM "${classesTable}"
        WHERE "isActive" = true
        ORDER BY name ASC
        LIMIT 1
      `);

      if (defaultClass.length === 0) {
        // If no active class exists, try to find any class
        const anyClass = await queryRunner.query(`
          SELECT id, name
          FROM "${classesTable}"
          ORDER BY name ASC
          LIMIT 1
        `);

        if (anyClass.length === 0) {
          throw new Error(
            'Cannot proceed with migration: No classes exist in the database. ' +
            'Please create at least one class before running this migration.'
          );
        }

        console.log(`⚠️  No active classes found. Using class: ${anyClass[0].name}`);
        const classId = anyClass[0].id;

        // Assign all unassigned students to this class
        await queryRunner.query(`
          UPDATE "${studentsTable}"
          SET "classId" = $1
          WHERE "classId" IS NULL
        `, [classId]);

        console.log(`✓ Assigned ${studentsWithoutClass.length} students to class: ${anyClass[0].name}`);
      } else {
        const classId = defaultClass[0].id;
        console.log(`Using default class: ${defaultClass[0].name}`);

        // Assign all unassigned students to this class
        await queryRunner.query(`
          UPDATE "${studentsTable}"
          SET "classId" = $1
          WHERE "classId" IS NULL
        `, [classId]);

        console.log(`✓ Assigned ${studentsWithoutClass.length} students to class: ${defaultClass[0].name}`);
      }
    }

    // Step 3: Make classId column non-nullable
    // First, drop the foreign key constraint if it exists
    const table = await queryRunner.getTable(studentsTable);
    if (table) {
      const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('classId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey(studentsTable, foreignKey);
        console.log('✓ Dropped existing foreign key constraint on classId');
      }
    }

    // Make classId NOT NULL
    await queryRunner.query(`
      ALTER TABLE "${studentsTable}"
      ALTER COLUMN "classId" SET NOT NULL
    `);
    console.log('✓ Made classId column NOT NULL');

    // Recreate the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${studentsTable}"
      ADD CONSTRAINT "FK_students_classId"
      FOREIGN KEY ("classId")
      REFERENCES "${classesTable}"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    `);
    console.log('✓ Recreated foreign key constraint on classId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const studentsTable = 'students';

    // Drop the foreign key constraint
    const table = await queryRunner.getTable(studentsTable);
    if (table) {
      const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('classId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey(studentsTable, foreignKey);
      }
    }

    // Make classId nullable again
    await queryRunner.query(`
      ALTER TABLE "${studentsTable}"
      ALTER COLUMN "classId" DROP NOT NULL
    `);

    // Recreate the foreign key constraint (nullable)
    await queryRunner.query(`
      ALTER TABLE "${studentsTable}"
      ADD CONSTRAINT "FK_students_classId"
      FOREIGN KEY ("classId")
      REFERENCES "classes"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
    `);
  }
}

