import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { UserActionLog } from '../entities/UserActionLog';

async function persistActionLog(req: Request): Promise<void> {
  const path = req.path || '';
  if (path.startsWith('/auth') || path.startsWith('/audit/activity')) {
    return;
  }

  const token = req.headers.authorization?.split(' ')[1];
  let userId: string | null = null;
  let username: string | null = null;
  let role: string | null = null;
  if (token && process.env.JWT_SECRET) {
    try {
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded?.userId || null;
      role = decoded?.role || null;
    } catch {
      // ignore invalid token for logging
    }
  }

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

  const action = req.method === 'POST' ? 'CREATE'
    : req.method === 'PUT' ? 'UPDATE'
    : req.method === 'DELETE' ? 'DELETE'
    : 'READ';

  const resourceId = (req.params && (req.params.id || req.params.studentId || req.params.teacherId)) || null;
  const sessionId = (req.headers['x-session-id'] as string) || null;
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || (req.socket && (req.socket.remoteAddress || (req.connection as any)?.remoteAddress))
    || (req as any).ip
    || null;
  const userAgent = (req.headers['user-agent'] as string) || null;
  const metadata = JSON.stringify({
    path: req.originalUrl || req.url,
    params: req.params,
    query: req.query,
    bodyKeys: Object.keys(req.body || {}),
  });

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const repo = AppDataSource.getRepository(UserActionLog);
  const entry = repo.create({
    userId: userId || 'unknown',
    sessionId,
    username,
    role,
    module,
    action: action as any,
    resourceType: module,
    resourceId: resourceId ? String(resourceId) : null,
    metadata,
    ipAddress,
    userAgent,
  });
  await repo.save(entry);
}

export const actionLogger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.path || '';
    if (path.startsWith('/auth') || path.startsWith('/audit/activity')) {
      return next();
    }

    // Do not delay read/search endpoints on audit log writes
    if (req.method === 'GET') {
      void persistActionLog(req).catch(() => {});
      return next();
    }

    try {
      await persistActionLog(req);
    } catch {
      // Avoid blocking request on logging failure
    }
  } catch {
    // swallow
  }
  next();
};
