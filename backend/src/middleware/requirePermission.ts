import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../entities/User';
import { userHasPermission } from '../services/rbac.service';
import { RbacAction } from '../constants/rbac';
import { isFullAccessRole } from '../constants/userRoles';

/**
 * Enforce granular RBAC permission after authenticate().
 * Superadmin and admin bypass checks.
 */
export const requirePermission = (module: string, action: RbacAction | string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (
        isFullAccessRole(req.user.role) ||
        req.user.role === UserRole.ADMIN ||
        req.user.role === UserRole.DIRECTOR
      ) {
        return next();
      }

      const allowed = await userHasPermission(req.user, module, action);
      if (!allowed) {
        return res.status(403).json({
          message: 'Access denied. You do not have permission to perform this action.',
          code: 'RBAC_FORBIDDEN',
          module,
          action,
        });
      }

      return next();
    } catch (err: any) {
      console.error('[requirePermission]', err?.message);
      return res.status(500).json({ message: 'Permission check failed' });
    }
  };
};

/** Require at least view access on a module */
export const requireModuleView = (module: string) => requirePermission(module, 'view');

/** Require edit access on a finance sub-page (e.g. creditNotes, transportAdjust) */
export const requireFinancePageEdit = (pageKey: string) =>
  requirePermission('financePage', `${pageKey}.edit`);

/** Require view access on a finance sub-page */
export const requireFinancePageView = (pageKey: string) =>
  requirePermission('financePage', `${pageKey}.view`);
