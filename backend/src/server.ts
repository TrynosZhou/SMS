import dotenv from 'dotenv';
dotenv.config(); // MUST be first

import 'reflect-metadata';
import express from 'express';
import cors from 'cors';

import { AppDataSource } from './config/database';
import routes from './routes';

// =================== VALIDATE REQUIRED ENV ===================
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required');
  process.exit(1);
}

// Optional: log to confirm
console.log('[Server] DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('[Server] JWT_SECRET exists:', !!process.env.JWT_SECRET);

// =================== EXPRESS SETUP ===================
const app = express();

// Configure CORS
const allowedOrigins = [
  'https://sms-apua.vercel.app',
  'http://localhost:4200',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl, mobile
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    console.log('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded student photos
app.use('/uploads/students', express.static('uploads/students'));

// =================== ROUTES ===================
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'School Management System API' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
});

// =================== DATABASE & SERVER ===================
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    console.log('[Server] Initializing database...');
    await AppDataSource.initialize();
    console.log('[Server] ✓ Database connected successfully');

    console.log(`[Server] Starting HTTP server on port ${PORT}...`);
    app.listen(PORT, () => {
      console.log(`[Server] ✓ Server running on port ${PORT}`);
    });
  } catch (error: any) {
    console.error('[Server] ✗ ERROR during startup:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[Server] ✗ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] ✗ UNHANDLED REJECTION:', reason);
  process.exit(1);
});

startServer();
