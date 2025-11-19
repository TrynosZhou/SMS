import 'reflect-metadata';
console.log('[Server] ✓ reflect-metadata loaded');

import express from 'express';
console.log('[Server] ✓ express loaded');

import cors from 'cors';
console.log('[Server] ✓ cors loaded');

import dotenv from 'dotenv';
console.log('[Server] ✓ dotenv loaded');

console.log('[Server] Loading database configuration...');
import { AppDataSource } from './config/database';
console.log('[Server] ✓ Database configuration imported');

import routes from './routes';
console.log('[Server] ✓ Routes loaded');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  process.exit(1);
}

// Validate JWT_SECRET
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️ JWT_SECRET should be at least 32 characters long');
}

const app = express();

// =================== MIDDLEWARE ===================
// Configure CORS to allow requests from frontend
// Allow all origins in development, specific origins in production
const allowedOrigins = [
  'https://sms-apua.vercel.app',
  'http://localhost:4200',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Log the origin for debugging
    console.log('CORS request from origin:', origin);
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    // Also allow any vercel.app subdomain for flexibility
    const isAllowed = allowedOrigins.length === 0 || 
                     allowedOrigins.includes(origin) ||
                     origin.includes('.vercel.app');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, false); // Return false instead of error for better handling
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
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

// Debug route for exams
app.get('/api/exams/test', (req, res) => {
  res.json({ message: 'Exam routes are working', path: req.path });
});
app.get('/', (req, res) => {
  res.send('<h1>School Management System API</h1><p>Use /api/... endpoints to interact.</p>');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
});

// =================== DATABASE & SERVER ===================
const PORT = process.env.PORT || 3001;

console.log('[Server] Starting database initialization...');
console.log('[Server] Node version:', process.version);
console.log('[Server] Platform:', process.platform);
console.log('[Server] Architecture:', process.arch);
console.log('[Server] Current working directory:', process.cwd());
console.log('[Server] __dirname equivalent check...');
console.log('[Server] AppDataSource type:', typeof AppDataSource);
console.log('[Server] AppDataSource.isInitialized before:', AppDataSource.isInitialized);
console.log('[Server] About to call AppDataSource.initialize()...');

// Add process listeners to catch unhandled errors
process.on('uncaughtException', (error) => {
  console.error('[Server] ✗ UNCAUGHT EXCEPTION:');
  console.error('[Server] Error:', error);
  console.error('[Server] Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] ✗ UNHANDLED REJECTION:');
  console.error('[Server] Reason:', reason);
  console.error('[Server] Promise:', promise);
});

// Wrap initialize in a try-catch to get more details
try {
  console.log('[Server] Calling AppDataSource.initialize()...');
  const initPromise = AppDataSource.initialize();
  console.log('[Server] initialize() promise created, awaiting...');
  
  initPromise
  .then(async () => {
    console.log('[Server] ✓ Database connected successfully');
    console.log('[Server] DataSource.isInitialized:', AppDataSource.isInitialized);

    try {
      console.log('[Server] Running pending migrations (if any)...');
      const pendingMigrations = await AppDataSource.showMigrations();
      if (pendingMigrations) {
        await AppDataSource.runMigrations();
        console.log('[Server] ✓ Migrations executed');
      } else {
        console.log('[Server] No migrations to run');
      }
    } catch (migrationError: any) {
      console.error('[Server] ✗ ERROR running migrations:');
      console.error('[Server] Migration error message:', migrationError?.message);
    }

    console.log('[Server] DataSource options:', {
      type: AppDataSource.options.type,
      database: AppDataSource.options.database,
      entitiesCount: AppDataSource.entityMetadatas.length,
      migrationsCount: AppDataSource.migrations.length
    });
    console.log('[Server] Starting HTTP server on port', PORT);
    app.listen(PORT, () => {
      console.log(`[Server] ✓ Server running on port ${PORT}`);
    });
  })
  .catch((error: any) => {
    console.error('[Server] ✗ ERROR connecting to database:');
    console.error('[Server] Error type:', error?.constructor?.name);
    console.error('[Server] Error name:', error?.name);
    console.error('[Server] Error message:', error?.message);
    console.error('[Server] Error code:', error?.code);
    console.error('[Server] Error errno:', error?.errno);
    console.error('[Server] Error syscall:', error?.syscall);
    console.error('[Server] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('[Server] Error stack:');
    console.error(error?.stack);
    if (error?.cause) {
      console.error('[Server] Error cause:', error.cause);
    }
    if (error?.parent) {
      console.error('[Server] Error parent:', error.parent);
    }
    if (error?.originalError) {
      console.error('[Server] Original error:', error.originalError);
    }
    process.exit(1);
  });
} catch (syncError: any) {
  console.error('[Server] ✗ SYNCHRONOUS ERROR during initialize() call:');
  console.error('[Server] Error type:', syncError?.constructor?.name);
  console.error('[Server] Error message:', syncError?.message);
  console.error('[Server] Error stack:', syncError?.stack);
  process.exit(1);
}
