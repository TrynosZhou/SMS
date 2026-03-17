import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { UserSessionLog } from '../entities/UserSessionLog';
import { ModuleAccessLog } from '../entities/ModuleAccessLog';
import PDFDocument from 'pdfkit';

export const logActivity = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { module } = req.body as { module?: string };
    const sessionId = (req.headers['x-session-id'] as string) || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket && (req.socket.remoteAddress || (req.connection as any)?.remoteAddress)) || (req as any).ip || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const repo = AppDataSource.getRepository(UserSessionLog);
    let session = await repo.findOne({
      where: { userId: user.id, logoutAt: null },
      order: { loginAt: 'DESC' }
    });
    if (!session) {
      session = repo.create({
        userId: user.id,
        username: user.username || user.email || null,
        role: user.role,
        sessionId,
        ipAddress,
        userAgent,
        loginAt: new Date(),
        lastActivityAt: new Date(),
        modules: module || null,
        timeSpentSeconds: 0
      });
    } else {
      const now = new Date();
      session.lastActivityAt = now;
      // Append unique module names
      if (module && module.trim()) {
        const existing = (session.modules || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!existing.includes(module)) existing.push(module);
        session.modules = existing.join(', ');
      }
      session.timeSpentSeconds = Math.max(0, Math.floor((now.getTime() - session.loginAt.getTime()) / 1000));
    }
    await repo.save(session);
    // Record module access entry
    try {
      const accessRepo = AppDataSource.getRepository(ModuleAccessLog);
      const entry = accessRepo.create({
        userId: user.id,
        sessionId: sessionId || session.sessionId || null,
        username: user.username || user.email || null,
        role: user.role,
        module: module || 'Unknown',
        route: (req as any).originalUrl || req.path || null,
        ipAddress,
        userAgent
      });
      await accessRepo.save(entry);
    } catch (e: any) {
      console.warn('[Audit] Failed to record module access:', e?.message);
    }
    return res.json({ message: 'Activity logged' });
  } catch (err: any) {
    console.error('logActivity error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message || 'Unknown error' });
  }
};

export const getUserSessions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { startDate, endDate, role, search, page = '1', limit = '20', sortKey = 'loginAt', sortDir = 'DESC' } = req.query as any;
    const repo = AppDataSource.getRepository(UserSessionLog);
    const qb = repo.createQueryBuilder('s')
      .where('LOWER(s.role) IN (:...roles)', { roles: ['admin', 'superadmin', 'accountant'] });
    const isValidDate = (v: any) => typeof v === 'string' && v !== 'undefined' && !isNaN(Date.parse(v));
    if (isValidDate(startDate)) qb.andWhere('s.loginAt >= :start', { start: new Date(startDate) });
    if (isValidDate(endDate)) qb.andWhere('s.loginAt <= :end', { end: new Date(endDate) });
    if (role && role !== 'all' && role !== 'undefined') {
      qb.andWhere('LOWER(s.role) = :role', { role: String(role).toLowerCase() });
    }
    if (search && search !== 'undefined' && String(search).trim()) {
      const q = `%${String(search).trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(s.username) LIKE :q OR LOWER(s.userId) LIKE :q)', { q });
    }
    // Sorting
    const allowedSort = new Set(['loginAt', 'lastActivityAt', 'logoutAt', 'timeSpentSeconds', 'role', 'username', 'ipAddress', 'sessionId']);
    const key = allowedSort.has(String(sortKey)) ? String(sortKey) : 'loginAt';
    const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`s.${key}`, dir as any);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [rows, total] = await qb.skip((pageNum - 1) * limitNum).take(limitNum).getManyAndCount();
    return res.json({ data: rows, total });
  } catch (err: any) {
    console.error('getUserSessions error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message || 'Unknown error' });
  }
};

export const exportUserSessionsCsv = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { startDate, endDate, role, search, sortKey = 'loginAt', sortDir = 'DESC' } = req.query as any;
    const repo = AppDataSource.getRepository(UserSessionLog);
    const qb = repo.createQueryBuilder('s').where('LOWER(s.role) IN (:...roles)', { roles: ['admin', 'superadmin', 'accountant'] });
    const isValidDate = (v: any) => typeof v === 'string' && v !== 'undefined' && !isNaN(Date.parse(v));
    if (isValidDate(startDate)) qb.andWhere('s.loginAt >= :start', { start: new Date(startDate) });
    if (isValidDate(endDate)) qb.andWhere('s.loginAt <= :end', { end: new Date(endDate) });
    if (role && role !== 'all' && role !== 'undefined') qb.andWhere('LOWER(s.role) = :role', { role: String(role).toLowerCase() });
    if (search && search !== 'undefined' && String(search).trim()) {
      const q = `%${String(search).trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(s.username) LIKE :q OR LOWER(s.userId) LIKE :q)', { q });
    }
    const allowedSort = new Set(['loginAt', 'lastActivityAt', 'logoutAt', 'timeSpentSeconds', 'role', 'username', 'ipAddress', 'sessionId']);
    const key = allowedSort.has(String(sortKey)) ? String(sortKey) : 'loginAt';
    const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`s.${key}`, dir as any);
    const rows = await qb.getMany();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="user_sessions.csv"');
    const header = ['User','Role','Login Time','Last Activity','Logout Time','Time Spent (s)','Modules','Session ID','IP Address','User Agent'];
    res.write(header.join(',') + '\n');
    for (const s of rows) {
      const line = [
        `"${((s.username || s.userId || '') as any).toString().replace(/"/g,'""')}"`,
        s.role || '',
        s.loginAt ? new Date(s.loginAt).toISOString() : '',
        s.lastActivityAt ? new Date(s.lastActivityAt).toISOString() : '',
        s.logoutAt ? new Date(s.logoutAt).toISOString() : '',
        String(s.timeSpentSeconds || 0),
        `"${(s.modules || '').replace(/"/g,'""')}"`,
        s.sessionId || '',
        s.ipAddress || '',
        `"${(s.userAgent || '').replace(/"/g,'""')}"`
      ].join(',');
      res.write(line + '\n');
    }
    res.end();
  } catch (err: any) {
    console.error('exportUserSessionsCsv error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message || 'Unknown error' });
  }
};

export const exportUserSessionsPdf = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { startDate, endDate, role, search, sortKey = 'loginAt', sortDir = 'DESC' } = req.query as any;
    const repo = AppDataSource.getRepository(UserSessionLog);
    const qb = repo.createQueryBuilder('s').where('LOWER(s.role) IN (:...roles)', { roles: ['admin', 'superadmin', 'accountant'] });
    const isValidDate = (v: any) => typeof v === 'string' && v !== 'undefined' && !isNaN(Date.parse(v));
    if (isValidDate(startDate)) qb.andWhere('s.loginAt >= :start', { start: new Date(startDate) });
    if (isValidDate(endDate)) qb.andWhere('s.loginAt <= :end', { end: new Date(endDate) });
    if (role && role !== 'all' && role !== 'undefined') qb.andWhere('LOWER(s.role) = :role', { role: String(role).toLowerCase() });
    if (search && search !== 'undefined' && String(search).trim()) {
      const q = `%${String(search).trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(s.username) LIKE :q OR LOWER(s.userId) LIKE :q)', { q });
    }
    const allowedSort = new Set(['loginAt', 'lastActivityAt', 'logoutAt', 'timeSpentSeconds', 'role', 'username', 'ipAddress', 'sessionId']);
    const key = allowedSort.has(String(sortKey)) ? String(sortKey) : 'loginAt';
    const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`s.${key}`, dir as any);
    const rows = await qb.getMany();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="user_sessions.pdf"');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    doc.fontSize(16).text('User Sessions Report');
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();
    const header = ['User','Role','Login','Last','Logout','Minutes','Modules'];
    doc.fontSize(10).text(header.join(' | '));
    doc.moveDown(0.2);
    for (const s of rows) {
      const minutes = Math.round((s.timeSpentSeconds || 0) / 60);
      const line = [
        (s.username || s.userId || ''),
        (s.role || ''),
        (s.loginAt ? new Date(s.loginAt).toLocaleString() : ''),
        (s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : ''),
        (s.logoutAt ? new Date(s.logoutAt).toLocaleString() : ''),
        String(minutes),
        (s.modules || '')
      ].join(' | ');
      doc.text(line, { continued: false });
    }
    doc.end();
  } catch (err: any) {
    console.error('exportUserSessionsPdf error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message || 'Unknown error' });
  }
};
