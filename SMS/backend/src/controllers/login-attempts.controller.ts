import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { LoginAttemptLog } from '../entities/LoginAttemptLog';

export const getLoginAttempts = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { startDate, endDate, success, search, page = '1', limit = '20' } = req.query as any;
    const repo = AppDataSource.getRepository(LoginAttemptLog);
    const qb = repo.createQueryBuilder('a')
      .orderBy('a.attemptedAt', 'DESC');
    if (startDate) qb.andWhere('a.attemptedAt >= :start', { start: new Date(startDate) });
    if (endDate) qb.andWhere('a.attemptedAt <= :end', { end: new Date(endDate) });
    if (typeof success !== 'undefined' && success !== '') {
      qb.andWhere('a.success = :success', { success: String(success) === 'true' });
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(a.username) LIKE :q OR LOWER(a.userId) LIKE :q OR LOWER(a.role) LIKE :q)', { q });
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [rows, total] = await qb.skip((pageNum - 1) * limitNum).take(limitNum).getManyAndCount();
    return res.json({ data: rows, total });
  } catch (err: any) {
    console.error('getLoginAttempts error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message || 'Unknown error' });
  }
};
