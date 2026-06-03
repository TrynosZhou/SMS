import { AppDataSource } from '../config/database';

/** Add settings.classLevels if the entity was deployed before the migration ran. */
export async function ensureSettingsClassLevelsColumn(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    return;
  }
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    const table = await queryRunner.getTable('settings');
    if (!table?.findColumnByName('classLevels')) {
      await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "classLevels" json`);
      console.log('[Server] ✓ Added settings.classLevels column');
    }
  } finally {
    await queryRunner.release();
  }
}
