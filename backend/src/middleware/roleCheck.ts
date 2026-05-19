import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../entities/User';

export const requireRole = (roles: UserRole | UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

export const requireAdmin = requireRole([UserRole.ADMIN, UserRole.SUPERADMIN]);
export const requireSuperAdmin = requireRole(UserRole.SUPERADMIN);
export const requireTeacher = requireRole(UserRole.TEACHER);
export const requireAccountant = requireRole(UserRole.ACCOUNTANT);
export const requireParent = requireRole(UserRole.PARENT);
export const requireStudent = requireRole(UserRole.STUDENT);
