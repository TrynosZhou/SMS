import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { CreateChatbotTables1789000000000 } from '../src/migrations/1789000000000-CreateChatbotTables';

async function runChatbotMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const migration = new CreateChatbotTables1789000000000();
      console.log('Running CreateChatbotTables migration...');
      await migration.up(queryRunner);
      try {
        await queryRunner.query(
          `INSERT INTO migrations ("timestamp", "name") VALUES (1789000000000, 'CreateChatbotTables1789000000000')`
        );
      } catch (_) {
        /* already recorded */
      }
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('Chatbot tables ready');
    process.exit(0);
  } catch (error: any) {
    console.error('Error running chatbot migration:', error);
    process.exit(1);
  }
}

runChatbotMigration();
