import { AppDataSource } from '../config/database';
import { Feature } from '../entities/Feature';
import { License } from '../entities/License';
import { TierFeature } from '../entities/TierFeature';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  allowed: boolean;
  expiresAt: number;
}

/** key: `${schoolId}:${featureKey}` */
const accessCache = new Map<string, CacheEntry>();

function cacheKey(schoolId: string, featureKey: string): string {
  return `${schoolId}:${featureKey.trim().toLowerCase()}`;
}

function getCached(schoolId: string, featureKey: string): boolean | null {
  const key = cacheKey(schoolId, featureKey);
  const entry = accessCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    accessCache.delete(key);
    return null;
  }
  return entry.allowed;
}

function setCached(schoolId: string, featureKey: string, allowed: boolean): void {
  accessCache.set(cacheKey(schoolId, featureKey), {
    allowed,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/** Invalidate all cached access results for one school. */
export function invalidateSchoolLicenseCache(schoolId: string): void {
  const prefix = `${schoolId}:`;
  for (const key of accessCache.keys()) {
    if (key.startsWith(prefix)) {
      accessCache.delete(key);
    }
  }
}

/**
 * Invalidate cache for every school on a tier (instant effect after tier_features change).
 */
export async function invalidateTierLicenseCache(tierId: string): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const licenseRepo = AppDataSource.getRepository(License);
  const licenses = await licenseRepo.find({
    where: { tierId, isActive: true },
    select: ['schoolId']
  });

  if (licenses.length === 0) {
    return;
  }

  for (const license of licenses) {
    invalidateSchoolLicenseCache(license.schoolId);
  }
}

/** Clear entire access cache (e.g. feature deactivated globally). */
export function invalidateAllLicenseCache(): void {
  accessCache.clear();
}

async function evaluateAccess(schoolId: string, featureKey: string): Promise<boolean> {
  const normalizedKey = featureKey.trim().toLowerCase();
  if (!schoolId || !normalizedKey) {
    return false;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const today = new Date().toISOString().slice(0, 10);

  const row = await AppDataSource.getRepository(License)
    .createQueryBuilder('license')
    .innerJoin('license.tier', 'tier')
    .innerJoin(TierFeature, 'tf', 'tf.tierId = license.tierId')
    .innerJoin(Feature, 'feature', 'feature.id = tf.featureId')
    .where('license.schoolId = :schoolId', { schoolId })
    .andWhere('license.isActive = true')
    .andWhere('license.validFrom <= :today', { today })
    .andWhere('(license.validUntil IS NULL OR license.validUntil >= :today)', { today })
    .andWhere('LOWER(feature.featureKey) = :featureKey', { featureKey: normalizedKey })
    .andWhere('feature.isActive = true')
    .select('license.id')
    .limit(1)
    .getRawOne();

  return !!row;
}

/**
 * Returns whether a school's active license tier includes the given feature.
 * All access decisions must go through this function.
 */
export async function canAccess(schoolId: string, featureKey: string): Promise<boolean> {
  const cached = getCached(schoolId, featureKey);
  if (cached !== null) {
    return cached;
  }

  const allowed = await evaluateAccess(schoolId, featureKey);
  setCached(schoolId, featureKey, allowed);
  return allowed;
}
