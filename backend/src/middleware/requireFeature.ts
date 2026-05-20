import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../entities/User';
import { canAccess } from '../services/licenseAccess.service';
import { resolveSchoolId } from '../services/schoolContext.service';

/**
 * Optional per-route middleware: attach only on routes you explicitly protect.
 * Not applied globally — unprotected routes behave as before.
 *
 * Tier-to-feature mapping is always read from the database via canAccess().
 */
export const requireFeature = (featureKey: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // School operators configure the system and license tiers; tier gates apply to staff roles.
      if (req.user.role === UserRole.SUPERADMIN || req.user.role === UserRole.ADMIN) {
        return next();
      }

      const schoolId = await resolveSchoolId(req);
      if (!schoolId) {
        return res.status(403).json({ error: 'upgrade_required', feature: featureKey });
      }

      const allowed = await canAccess(schoolId, featureKey);
      if (!allowed) {
        return res.status(403).json({ error: 'upgrade_required', feature: featureKey });
      }

      return next();
    } catch (error: any) {
      // Fail-open if license tables/DB are unavailable during rollout (route stays usable).
      console.error('[requireFeature] License check unavailable — allowing request:', error?.message || error);
      return next();
    }
  };
};
