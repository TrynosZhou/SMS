import 'reflect-metadata';
import { AppDataSource } from '../config/database';

/**
 * Cleanup script to remove schools table and related migrations
 * This completes the Schools entity removal process
 */
async function cleanupSchoolsTable() {
  try {
    console.log('🔧 Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const queryRunner = AppDataSource.createQueryRunner();

    console.log('🔍 Checking if schools table exists...');
    const tableExists = await queryRunner.hasTable('schools');
    
    if (tableExists) {
      console.log('⚠️  Schools table found. Dropping it...');
      await queryRunner.dropTable('schools', true, true, true);
      console.log('✓ Schools table dropped\n');
    } else {
      console.log('✓ Schools table does not exist (already removed)\n');
    }

    console.log('🔍 Checking for school-related migrations...');
    
    const schoolMigrations = [
      'AddSchoolMultitenancy1700240000000',
      'RenameCodeToSchoolid1700250000000',
      'RemoveSchoolMultitenancy1700260000000',
      'CreateSchoolsTable1700300000000'
    ];

    // Get all migrations
    const allMigrations = await queryRunner.query(
      `SELECT "timestamp", name FROM migrations ORDER BY "timestamp"`
    );

    const foundMigrations = allMigrations.filter((m: any) => 
      schoolMigrations.includes(m.name)
    );

    if (foundMigrations.length > 0) {
      console.log(`⚠️  Found ${foundMigrations.length} school-related migration(s) to remove:`);
      foundMigrations.forEach((m: any) => {
        console.log(`  - ${m.name}`);
      });

      console.log('\n🔧 Removing school-related migrations...');
      await queryRunner.query(
        `DELETE FROM migrations WHERE name IN ($1, $2, $3, $4)`,
        [schoolMigrations[0], schoolMigrations[1], schoolMigrations[2], schoolMigrations[3]]
      );
      console.log('✓ School-related migrations removed\n');
    } else {
      console.log('✓ No school-related migrations found (already cleaned)\n');
    }

    // Verify cleanup
    console.log('🔍 Verifying cleanup...\n');
    
    const schoolsTableStillExists = await queryRunner.hasTable('schools');
    const remainingMigrations = await queryRunner.query(
      `SELECT name FROM migrations WHERE name IN ($1, $2, $3, $4)`,
      [schoolMigrations[0], schoolMigrations[1], schoolMigrations[2], schoolMigrations[3]]
    );

    if (!schoolsTableStillExists && remainingMigrations.length === 0) {
      console.log('✅ Cleanup completed successfully!');
      console.log('   - Schools table: Removed');
      console.log('   - School migrations: Removed');
      console.log('\n🎉 You can now restart your server without migration errors!');
    } else {
      console.log('⚠️  Cleanup completed with warnings:');
      if (schoolsTableStillExists) {
        console.log('   - Schools table: Still exists (may need manual removal)');
      }
      if (remainingMigrations.length > 0) {
        console.log(`   - School migrations: ${remainingMigrations.length} still present`);
      }
    }

    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('\n✅ Script completed!');

  } catch (error: any) {
    console.error('\n❌ Error during cleanup:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the cleanup
cleanupSchoolsTable().catch(console.error);

