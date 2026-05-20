import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Feature } from '../entities/Feature';
import { License } from '../entities/License';
import { TierFeature } from '../entities/TierFeature';
import { resolveSchoolId } from '../services/schoolContext.service';

export const getMyLicenseAccess = async (req: AuthRequest, res: Response) => {
  try {
    const featureRepo = AppDataSource.getRepository(Feature);
    const allFeatures = await featureRepo.find({
      where: { isActive: true },
      order: { displayName: 'ASC' }
    });

    if (req.user?.role === UserRole.SUPERADMIN) {
      const keys = allFeatures.map((f) => f.featureKey.toLowerCase());
      return res.json({
        tierName: null,
        tierDisplayName: 'Full access',
        grantedFeatureKeys: keys,
        features: allFeatures.map((f) => ({
          featureKey: f.featureKey,
          displayName: f.displayName,
          description: f.description,
          granted: true
        }))
      });
    }

    const schoolId = await resolveSchoolId(req);
    if (!schoolId) {
      return res.json({
        tierName: null,
        tierDisplayName: null,
        grantedFeatureKeys: [],
        features: allFeatures.map((f) => ({
          featureKey: f.featureKey,
          displayName: f.displayName,
          description: f.description,
          granted: false
        }))
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const license = await AppDataSource.getRepository(License)
      .createQueryBuilder('license')
      .innerJoinAndSelect('license.tier', 'tier')
      .where('license.schoolId = :schoolId', { schoolId })
      .andWhere('license.isActive = true')
      .andWhere('license.validFrom <= :today', { today })
      .andWhere('(license.validUntil IS NULL OR license.validUntil >= :today)', { today })
      .orderBy('license.validFrom', 'DESC')
      .getOne();

    if (!license?.tier) {
      return res.json({
        tierName: null,
        tierDisplayName: null,
        grantedFeatureKeys: [],
        features: allFeatures.map((f) => ({
          featureKey: f.featureKey,
          displayName: f.displayName,
          description: f.description,
          granted: false
        }))
      });
    }

    const assignments = await AppDataSource.getRepository(TierFeature).find({
      where: { tierId: license.tierId },
      relations: ['feature']
    });

    const grantedSet = new Set(
      assignments
        .filter((a) => a.feature?.isActive)
        .map((a) => a.feature.featureKey.toLowerCase())
    );

    return res.json({
      tierName: license.tier.tierName,
      tierDisplayName: license.tier.displayName,
      grantedFeatureKeys: Array.from(grantedSet),
      features: allFeatures.map((f) => ({
        featureKey: f.featureKey,
        displayName: f.displayName,
        description: f.description,
        granted: grantedSet.has(f.featureKey.toLowerCase())
      }))
    });
  } catch (error: any) {
    console.error('[license.getMyLicenseAccess]', error);
    return res.status(500).json({ message: 'Failed to load license access', error: error.message });
  }
};
