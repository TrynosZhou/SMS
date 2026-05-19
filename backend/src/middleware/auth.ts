import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';

export interface AuthRequest extends Request {
  user?: User;
  file?: Express.Multer.File;
}

export const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string; role?: string };
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ['student', 'teacher', 'parent']
    });

    if (user && user.isActive) {
      req.user = user;
    }

    return next();
  } catch (_error: any) {
    return next();
  }
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret) as { userId: string; role?: string };
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ['student', 'teacher', 'parent']
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Auth error:', error);
    return res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Allow "Student acting as Parent" when a parent context header is present.
    // The controller must still verify the student is linked to that parent.
    const parentContextId = String((req.headers['x-parent-id'] as any) || '').trim();
    if (parentContextId && req.user.role === UserRole.STUDENT && roles.includes(UserRole.PARENT)) {
      return next();
    }

    // Allow "Parent acting as Student" when a student context header is present.
    // The controller must still verify the parent is linked to that student.
    const studentContextId = String((req.headers['x-student-id'] as any) || '').trim();
    if (studentContextId && req.user.role === UserRole.PARENT && roles.includes(UserRole.STUDENT)) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      console.log('Authorization failed:', {
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method
      });
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

