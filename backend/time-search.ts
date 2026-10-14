import { AppDataSource } from './src/config/database';
import { User } from './src/entities/User';
import * as jwt from 'jsonwebtoken';
import * as http from 'http';

const secret = process.env.JWT_SECRET || '';

async function httpGet(hostname: string, port: number, path: string, token: string): Promise<{ status: number; timeMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.get({
      hostname,
      port,
      path,
      headers: { Authorization: `Bearer ${token}` },
      family: hostname === 'localhost' ? 6 : 4,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode || 0, timeMs: Date.now() - start }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.findOne({ where: { role: 'admin' as any } });
  if (!admin) { console.log('No admin user found'); process.exit(1); }

  const token = jwt.sign({ userId: admin.id, role: admin.role }, secret, { expiresIn: '1h' });

  // Warm up direct
  try { await httpGet('127.0.0.1', 3001, '/api/students?page=1&limit=1', token); } catch {}

  // Test direct to backend
  for (let i = 0; i < 3; i++) {
    const r = await httpGet('127.0.0.1', 3001, '/api/students?search=fari&page=1&limit=50', token);
    console.log(`DIRECT  127.0.0.1:3001 → HTTP ${r.status} in ${r.timeMs}ms`);
  }

  // Test through Angular dev server (localhost:4200, IPv6)
  for (let i = 0; i < 3; i++) {
    try {
      const r = await httpGet('localhost', 4200, '/api/students?search=fari&page=1&limit=50', token);
      console.log(`PROXY   localhost:4200 → HTTP ${r.status} in ${r.timeMs}ms`);
    } catch (e: any) {
      console.log(`PROXY   localhost:4200 → ERROR: ${e.message}`);
    }
  }

  await AppDataSource.destroy();
  process.exit(0);
})();
