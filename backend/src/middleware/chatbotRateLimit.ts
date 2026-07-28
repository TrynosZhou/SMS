import { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = Number(process.env.CHATBOT_RATE_WINDOW_MS || 60 * 60 * 1000); // 1 hour
const LIMIT_AUTH = Number(process.env.CHATBOT_RATE_LIMIT_AUTH || 40);
const LIMIT_GUEST = Number(process.env.CHATBOT_RATE_LIMIT_GUEST || 20);

function clientKey(req: Request): string {
  const userId = (req as any).user?.id;
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  return userId ? `user:${userId}` : `ip:${ip}`;
}

/** Simple in-memory rate limiter for chatbot chat/escalate endpoints. */
export function chatbotRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = clientKey(req);
  const limit = (req as any).user?.id ? LIMIT_AUTH : LIMIT_GUEST;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    return res.status(429).json({
      message: 'Too many helpdesk requests. Please try again later.',
    });
  }

  return next();
}
