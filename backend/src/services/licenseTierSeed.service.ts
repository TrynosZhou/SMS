import { AppDataSource } from '../config/database';
import { LicenseTier } from '../entities/LicenseTier';

const DEFAULT_TIERS: Array<{ tierName: string; displayName: string; description: string }> = [
  { tierName: 'gold', displayName: 'Gold', description: 'Basic plan' },
  { tierName: 'bronze', displayName: 'Bronze', description: 'Standard plan' },
  { tierName: 'platinum', displayName: 'Platinum', description: 'Full access plan' }
];

/**
 * Ensures Gold / Bronze / Platinum rows exist (e.g. production DB missing tier seed).
 */
export async function ensureDefaultLicenseTiers(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const repo = AppDataSource.getRepository(LicenseTier);
  for (const row of DEFAULT_TIERS) {
    const existing = await repo.findOne({ where: { tierName: row.tierName } });
    if (!existing) {
      await repo.save(repo.create(row));
    }
  }
}
