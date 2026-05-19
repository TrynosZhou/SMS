import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { UserActionLog } from '../entities/UserActionLog';

export const actionLogger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip logging for auth endpoints (login/logout/reset) and audit logging itself
    const path = req.path || '';
    if (path.startsWith('/auth') || path.startsWith('/audit/activity')) {
      return next();
    }
    // Decode token to get user (best-effort)
    const token = req.headers.authorization?.split(' ')[1];
    let userId: string | null = null;
    let username: string | null = null;
    let role: string | null = null;
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded?.userId || null;
        role = decoded?.role || null;
      } catch {}
    }
    // Infer module from path
    const module = (() => {
      if (path.startsWith('/students')) return 'Students';
      if (path.startsWith('/teachers')) return 'Teachers';
      if (path.startsWith('/classes')) return 'Classes';
      if (path.startsWith('/subjects')) return 'Subjects';
      if (path.startsWith('/exams') || path.startsWith('/record-book') || path.startsWith('/rankings')) return 'Exams';
      if (path.startsWith('/settings') || path.startsWith('/timetables')) return 'Settings';
      if (path.startsWith('/attendance')) return 'Attendance';
      if (path.startsWith('/finance') || path.startsWith('/invoices') || path.startsWith('/payments')) return 'Finance';
      if (path.startsWith('/messages') || path.startsWith('/parent')) return 'Messages';
      return 'Other';
    })();
    // Map HTTP method to CRUD action
    const action = req.method === 'POST' ? 'CREATE'
      : req.method === 'PUT' ? 'UPDATE'
      : req.method === 'DELETE' ? 'DELETE'
      : 'READ';
    // Extract resource identifier from params if present
    const resourceId = (req.params && (req.params.id || req.params.studentId || req.params.teacherId)) || null;
    const resourceType = module;
    const sessionId = (req.headers['x-session-id'] as string) || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket && (req.socket.remoteAddress || (req.connection as any)?.remoteAddress)) || (req as any).ip || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const metadata = JSON.stringify({
      path: req.originalUrl || req.url,
      params: req.params,
      query: req.query,
      bodyKeys: Object.keys(req.body || {})
    });
    // Save log (best-effort)
    try {
      if (!AppDataSource.isInitialized) await AppDataSource.initialize();
      const repo = AppDataSource.getRepository(UserActionLog);
      const entry = repo.create({
        userId: userId || 'unknown',
        sessionId,
        username,
        role,
        module,
        action: action as any,
        resourceType,
        resourceId: resourceId ? String(resourceId) : null,
        metadata,
        ipAddress,
        userAgent
      });
      await repo.save(entry);
    } catch (e: any) {
      // Avoid blocking request on logging failure
    }
  } catch {
    // swallow
  }
  next();
};
