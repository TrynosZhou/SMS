import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { Feature } from '../entities/Feature';
import { LicenseTier } from '../entities/LicenseTier';
import { TierFeature } from '../entities/TierFeature';
import { LicenseFeatureAuditLog, LicenseAuditAction } from '../entities/LicenseFeatureAuditLog';
import {
  invalidateAllLicenseCache,
  invalidateTierLicenseCache
} from '../services/licenseAccess.service';
import { ensureDefaultLicenseTiers } from '../services/licenseTierSeed.service';

async function writeAudit(
  action: LicenseAuditAction,
  performedBy: string | null,
  opts: { tierId?: string | null; featureId?: string | null; metadata?: Record<string, unknown> }
): Promise<void> {
  const repo = AppDataSource.getRepository(LicenseFeatureAuditLog);
  await repo.save({
    action,
    tierId: opts.tierId ?? null,
    featureId: opts.featureId ?? null,
    performedBy,
    metadata: opts.metadata ?? null
  });
}

function normalizeFeatureKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export const listFeatures = async (_req: AuthRequest, res: Response) => {
  try {
    const features = await AppDataSource.getRepository(Feature).find({
      order: { featureKey: 'ASC' }
    });
    return res.json({ features });
  } catch (error: any) {
    console.error('[licenseAdmin.listFeatures]', error);
    return res.status(500).json({ message: 'Failed to list features', error: error.message });
  }
};

export const createFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { featureKey, displayName, description } = req.body || {};
    const key = normalizeFeatureKey(String(featureKey || ''));
    const label = String(displayName || '').trim();

    if (!key || !label) {
      return res.status(400).json({ message: 'featureKey and displayName are required' });
    }

    const repo = AppDataSource.getRepository(Feature);
    const existing = await repo.findOne({ where: { featureKey: key } });
    if (existing) {
      return res.status(409).json({ message: 'Feature key already exists' });
    }

    const feature = await repo.save(
      repo.create({
        featureKey: key,
        displayName: label,
        description: description ? String(description).trim() : null,
        isActive: true
      })
    );

    await writeAudit('feature_created', req.user?.id ?? null, {
      featureId: feature.id,
      metadata: { featureKey: feature.featureKey, displayName: feature.displayName }
    });

    return res.status(201).json({ feature });
  } catch (error: any) {
    console.error('[licenseAdmin.createFeature]', error);
    return res.status(500).json({ message: 'Failed to create feature', error: error.message });
  }
};

export const updateFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { displayName, description, isActive } = req.body || {};

    const repo = AppDataSource.getRepository(Feature);
    const feature = await repo.findOne({ where: { id } });
    if (!feature) {
      return res.status(404).json({ message: 'Feature not found' });
    }

    if (displayName !== undefined) {
      const label = String(displayName).trim();
      if (!label) {
        return res.status(400).json({ message: 'displayName cannot be empty' });
      }
      feature.displayName = label;
    }
    if (description !== undefined) {
      feature.description = description ? String(description).trim() : null;
    }
    if (isActive !== undefined) {
      feature.isActive = Boolean(isActive);
    }

    await repo.save(feature);

    await writeAudit('feature_updated', req.user?.id ?? null, {
      featureId: feature.id,
      metadata: {
        featureKey: feature.featureKey,
        displayName: feature.displayName,
        isActive: feature.isActive
      }
    });

    if (isActive === false) {
      invalidateAllLicenseCache();
    }

    return res.json({ feature });
  } catch (error: any) {
    console.error('[licenseAdmin.updateFeature]', error);
    return res.status(500).json({ message: 'Failed to update feature', error: error.message });
  }
};

export const deactivateFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Feature);
    const feature = await repo.findOne({ where: { id } });
    if (!feature) {
      return res.status(404).json({ message: 'Feature not found' });
    }

    feature.isActive = false;
    await repo.save(feature);

    await writeAudit('feature_deactivated', req.user?.id ?? null, {
      featureId: feature.id,
      metadata: { featureKey: feature.featureKey }
    });

    invalidateAllLicenseCache();
    return res.json({ feature });
  } catch (error: any) {
    console.error('[licenseAdmin.deactivateFeature]', error);
    return res.status(500).json({ message: 'Failed to deactivate feature', error: error.message });
  }
};

export const listTiersWithFeatures = async (_req: AuthRequest, res: Response) => {
  try {
    await ensureDefaultLicenseTiers();

    const tierRepo = AppDataSource.getRepository(LicenseTier);
    const tiers = await tierRepo.find({ order: { tierName: 'ASC' } });

    const tierFeatureRepo = AppDataSource.getRepository(TierFeature);
    let assignments: TierFeature[] = [];
    try {
      assignments = await tierFeatureRepo.find({
        relations: ['feature']
      });
    } catch (assignErr: any) {
      console.warn(
        '[licenseAdmin.listTiersWithFeatures] tier_features load failed — returning tiers without assignments:',
        assignErr?.message || assignErr
      );
    }

    const payload = tiers.map((tier) => {
      const tierAssignments = assignments.filter((a) => a.tierId === tier.id);
      return {
        id: tier.id,
        tierName: tier.tierName,
        displayName: tier.displayName,
        description: tier.description,
        features: tierAssignments
          .filter((a) => a.feature)
          .map((a) => ({
            assignmentId: a.id,
            featureId: a.feature.id,
            featureKey: a.feature.featureKey,
            displayName: a.feature.displayName,
            description: a.feature.description,
            isActive: a.feature.isActive,
            grantedAt: a.grantedAt,
            grantedBy: a.grantedBy,
            grantedByName: null as string | null
          }))
      };
    });

    return res.json({ tiers: payload });
  } catch (error: any) {
    console.error('[licenseAdmin.listTiersWithFeatures]', error);
    const msg = String(error?.message || '');
    if (msg.includes('license_tiers') || msg.includes('does not exist')) {
      return res.status(503).json({
        message:
          'License tables are missing on this database. Run: npm run migrate-license',
        error: error.message
      });
    }
    return res.status(500).json({ message: 'Failed to list tiers', error: error.message });
  }
};

export const grantTierFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { tierId, featureId } = req.params;
    const tierRepo = AppDataSource.getRepository(LicenseTier);
    const featureRepo = AppDataSource.getRepository(Feature);
    const tierFeatureRepo = AppDataSource.getRepository(TierFeature);

    const tier = await tierRepo.findOne({ where: { id: tierId } });
    if (!tier) {
      return res.status(404).json({ message: 'Tier not found' });
    }

    const feature = await featureRepo.findOne({ where: { id: featureId } });
    if (!feature) {
      return res.status(404).json({ message: 'Feature not found' });
    }
    if (!feature.isActive) {
      return res.status(400).json({ message: 'Cannot grant an inactive feature' });
    }

    const existing = await tierFeatureRepo.findOne({ where: { tierId, featureId } });
    if (existing) {
      return res.status(200).json({ assignment: existing });
    }

    const assignment = await tierFeatureRepo.save(
      tierFeatureRepo.create({
        tierId,
        featureId,
        grantedBy: req.user?.id ?? null
      })
    );

    await writeAudit('tier_feature_granted', req.user?.id ?? null, {
      tierId,
      featureId,
      metadata: { tierName: tier.tierName, featureKey: feature.featureKey }
    });

    await invalidateTierLicenseCache(tierId);

    return res.status(201).json({ assignment });
  } catch (error: any) {
    console.error('[licenseAdmin.grantTierFeature]', error);
    return res.status(500).json({ message: 'Failed to grant feature to tier', error: error.message });
  }
};

export const revokeTierFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { tierId, featureId } = req.params;
    const tierRepo = AppDataSource.getRepository(LicenseTier);
    const featureRepo = AppDataSource.getRepository(Feature);
    const tierFeatureRepo = AppDataSource.getRepository(TierFeature);

    const tier = await tierRepo.findOne({ where: { id: tierId } });
    const feature = await featureRepo.findOne({ where: { id: featureId } });
    if (!tier || !feature) {
      return res.status(404).json({ message: 'Tier or feature not found' });
    }

    const assignment = await tierFeatureRepo.findOne({ where: { tierId, featureId } });
    if (!assignment) {
      return res.status(404).json({ message: 'Feature is not assigned to this tier' });
    }

    await tierFeatureRepo.remove(assignment);

    await writeAudit('tier_feature_revoked', req.user?.id ?? null, {
      tierId,
      featureId,
      metadata: { tierName: tier.tierName, featureKey: feature.featureKey }
    });

    await invalidateTierLicenseCache(tierId);

    return res.json({ message: 'Feature revoked from tier' });
  } catch (error: any) {
    console.error('[licenseAdmin.revokeTierFeature]', error);
    return res.status(500).json({ message: 'Failed to revoke feature from tier', error: error.message });
  }
};

export const getLicenseAuditLog = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const logs = await AppDataSource.getRepository(LicenseFeatureAuditLog).find({
      relations: ['tier', 'feature', 'performer'],
      order: { createdAt: 'DESC' },
      take: limit
    });

    const entries = logs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      tierId: log.tierId,
      tierName: log.tier?.tierName ?? null,
      tierDisplayName: log.tier?.displayName ?? null,
      featureId: log.featureId,
      featureKey: log.feature?.featureKey ?? (log.metadata as any)?.featureKey ?? null,
      featureDisplayName: log.feature?.displayName ?? null,
      performedBy: log.performedBy,
      performedByName: log.performer
        ? `${log.performer.firstName || ''} ${log.performer.lastName || ''}`.trim() || log.performer.email
        : null,
      metadata: log.metadata
    }));

    return res.json({ entries });
  } catch (error: any) {
    console.error('[licenseAdmin.getLicenseAuditLog]', error);
    return res.status(500).json({ message: 'Failed to load audit log', error: error.message });
  }
};
