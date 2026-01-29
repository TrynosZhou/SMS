import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AppDataSource } from './config/database';
import routes from './routes';

dotenv.config(); // Load environment variables

// =================== ENV VARIABLES CHECK ===================
if (!process.env.JWT_SECRET) {
  console.error('❌ Missing required environment variable: JWT_SECRET');
  process.exit(1);
}
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const hasIndividualDb = !!(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
if (!hasDatabaseUrl && !hasIndividualDb) {
  console.error('❌ Missing database configuration. Set either DATABASE_URL or all of DB_HOST, DB_USERNAME, DB_NAME (and optionally DB_PASSWORD, DB_PORT).');
  process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️ JWT_SECRET should be at least 32 characters long');
}

// =================== EXPRESS APP ===================
const app = express();

// CORS configuration
const allowedOrigins = [
  'https://sms-apua.vercel.app',
  'http://localhost:4200',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl, mobile
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) return callback(null, true);
    console.log('CORS blocked origin:', origin);
    callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads/students', express.static('uploads/students'));

// =================== ROUTES ===================
app.use('/api', routes);
app.get('/health', (req, res) => res.json({ status: 'OK', message: 'School Management System API' }));
app.get('/', (req, res) => res.send('<h1>School Management System API</h1><p>Use /api/... endpoints</p>'));
app.use((req, res) => res.status(404).json({ message: 'Route not found', path: req.path, method: req.method }));

// =================== DATABASE & SERVER ===================
const PORT = process.env.PORT || 3001;

process.on('uncaughtException', (err) => {
  console.error('[Server] ✗ UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] ✗ UNHANDLED REJECTION:', reason, promise);
});

console.log('[Server] Initializing database connection...');
if (AppDataSource.options.synchronize) {
  console.log('[Server] Schema synchronization enabled - this may take a moment to create tables...');
}

// Add timeout wrapper for initialization with retry logic
let initAttempts = 0;
const maxInitAttempts = 3;
const initTimeout = setTimeout(() => {
  console.warn('[Server] ⚠️  Database initialization is taking longer than expected...');
  console.warn('[Server]    This is normal when creating many tables for the first time.');
  console.warn('[Server]    Please wait, or check your database connection if it takes too long.');
}, 10000); // Warn after 10 seconds

// Function to attempt initialization with retry
async function initializeDatabase(attempt: number = 1): Promise<void> {
  try {
    await AppDataSource.initialize();
    clearTimeout(initTimeout);
    console.log('[Server] ✓ Database connected');
    
    if (AppDataSource.options.synchronize) {
      console.log('[Server] ✓ Schema synchronization completed - all tables created/updated');
    }
    
    // Set up connection monitoring and error handling
    setupConnectionMonitoring();
    
    // Continue with server startup
    await startServer();
  } catch (error: any) {
    clearTimeout(initTimeout);
    
    // Check if it's a connection error that might be retryable
    const isConnectionError = 
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message?.includes('timeout') ||
      error.message?.includes('connection') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('terminated unexpectedly');
    
    if (isConnectionError && attempt < maxInitAttempts) {
      initAttempts++;
      const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
      console.warn(`[Server] ⚠️  Connection attempt ${attempt} failed:`, error.message);
      console.warn(`[Server]    Retrying in ${waitTime / 1000} seconds... (attempt ${attempt + 1}/${maxInitAttempts})`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return initializeDatabase(attempt + 1);
    }
    
    // If all retries failed or it's not a connection error, throw
    console.error('[Server] ✗ ERROR connecting to database:', error);
    if (error instanceof Error) {
      console.error('[Server] Error message:', error.message);
      console.error('[Server] Error code:', (error as any).code);
      if ((error as any).code) {
        console.error('[Server] Error stack:', error.stack);
      }
    }
    
    // Check for specific error types and provide targeted guidance
    const errorMessage = error?.message || '';
    const errorCode = (error as any)?.code;
    
    console.error('\n[Server] 🔍 Diagnostic Information:');
    
    if (errorMessage.includes('timeout') || errorCode === 'ETIMEDOUT') {
      console.error('[Server] ❌ Connection timeout detected!');
      console.error('[Server] ');
      console.error('[Server] For Render.com databases, this usually means:');
      console.error('[Server]   1. ⏸️  Database is PAUSED (free tier databases pause after inactivity)');
      console.error('[Server]      → Go to https://dashboard.render.com');
      console.error('[Server]      → Find your PostgreSQL database');
      console.error('[Server]      → Click "Wake" or "Resume" button');
      console.error('[Server]      → Wait 30-60 seconds for database to start');
      console.error('[Server] ');
      console.error('[Server]   2. 🔗 Using INTERNAL Database URL from local machine');
      console.error('[Server]      → Internal URLs only work from within Render network');
      console.error('[Server]      → Use EXTERNAL Database URL for local connections');
      console.error('[Server]      → In Render dashboard → Database → Connections tab');
      console.error('[Server]      → Copy "External Database URL" (not Internal)');
      console.error('[Server] ');
      console.error('[Server]   3. 🌐 Network/firewall blocking connection');
      console.error('[Server]      → Check if you can ping the database host');
      console.error('[Server]      → Verify your ISP/network allows outbound connections');
    } else if (errorCode === 'ECONNREFUSED') {
      console.error('[Server] ❌ Connection refused!');
      console.error('[Server]   1. Verify database is running and not paused');
      console.error('[Server]   2. Check hostname and port are correct');
      console.error('[Server]   3. Ensure you\'re using External URL for local connections');
    } else if (errorMessage.includes('SSL') || errorCode === '28000') {
      console.error('[Server] ❌ SSL connection error!');
      console.error('[Server]   Render.com requires SSL connections');
      console.error('[Server]   SSL should be auto-enabled - check DB_SSL setting');
    } else {
      console.error('[Server] Check your DATABASE_URL and ensure the database is accessible.');
      console.error('[Server] Verify:');
      console.error('[Server]   1. Database host is reachable');
      console.error('[Server]   2. Database credentials are correct');
      console.error('[Server]   3. Database exists and is running');
      console.error('[Server]   4. Network/firewall allows connections');
      console.error('[Server]   5. SSL settings are correct for hosted databases');
    }
    
    console.error('[Server] ');
    console.error('[Server] 💡 Quick Fix: Run this diagnostic script:');
    console.error('[Server]    node scripts/test-db-connection.js');
    console.error('');
    process.exit(1);
  }
}

// Set up connection monitoring and automatic reconnection
function setupConnectionMonitoring(): void {
  // Monitor connection pool for errors
  const driver = AppDataSource.driver as any;
  if (driver.pool) {
    driver.pool.on('error', (err: Error) => {
      console.error('[Server] ⚠️  Connection pool error:', err.message);
      // Don't exit - let TypeORM handle reconnection
    });
    
    driver.pool.on('connect', () => {
      console.log('[Server] ✓ New database connection established');
    });
    
    driver.pool.on('remove', () => {
      console.log('[Server] ⚠️  Database connection removed from pool');
    });
  }
  
  // Periodic health check
  setInterval(async () => {
    if (!AppDataSource.isInitialized) {
      console.warn('[Server] ⚠️  DataSource is not initialized, attempting to reconnect...');
      try {
        if (!AppDataSource.isInitialized) {
          await AppDataSource.initialize();
          console.log('[Server] ✓ Reconnected to database');
        }
      } catch (error: any) {
        console.error('[Server] ✗ Failed to reconnect:', error.message);
      }
    } else {
      // Test connection with a simple query
      try {
        await AppDataSource.query('SELECT 1');
      } catch (error: any) {
        console.error('[Server] ⚠️  Database health check failed:', error.message);
        // Try to reinitialize if connection is lost
        if (error.message?.includes('terminated') || error.message?.includes('connection')) {
          console.log('[Server] Attempting to reinitialize connection...');
          try {
            if (AppDataSource.isInitialized) {
              await AppDataSource.destroy();
            }
            await AppDataSource.initialize();
            console.log('[Server] ✓ Reconnected to database');
          } catch (reconnectError: any) {
            console.error('[Server] ✗ Failed to reconnect:', reconnectError.message);
          }
        }
      }
    }
  }, 60000); // Check every 60 seconds
}

// Start server after successful database connection
async function startServer(): Promise<void> {
  // Check if essential tables exist BEFORE running migrations
    let missingTables: string[] = [];
    try {
      const queryRunner = AppDataSource.createQueryRunner();
      const essentialTables = ['users', 'students', 'classes', 'teachers'];
      
      for (const table of essentialTables) {
        const exists = await queryRunner.hasTable(table);
        if (!exists) {
          missingTables.push(table);
        }
      }
      
      await queryRunner.release();
    } catch (checkError) {
      console.warn('[Server] ⚠️  Could not verify database tables:', (checkError as Error).message);
    }

    const runMigrations = (process.env.RUN_MIGRATIONS || '').toLowerCase() !== 'false';
    
    // If synchronize is enabled, skip migrations
    if (AppDataSource.options.synchronize) {
      console.log('[Server] Skipping migrations because synchronize=true (DB_SYNC)');
      console.log('[Server] Tables will be auto-created from entities');
    } 
    // If base tables are missing, migrations will fail - skip them and warn
    else if (missingTables.length > 0) {
      console.warn('[Server] ⚠️  WARNING: Missing base tables:', missingTables.join(', '));
      console.warn('[Server]    Migrations require base tables to exist first.');
      console.warn('[Server]    To fix this:');
      console.warn('[Server]    1. Set DB_SYNC=true in your .env file (development only)');
      console.warn('[Server]       This will auto-create all tables from entities');
      console.warn('[Server]    2. Restart the server');
      console.warn('[Server]    3. After tables are created, set DB_SYNC=false and RUN_MIGRATIONS=true');
      console.warn('[Server]    Migrations are being skipped to prevent errors.');
    } 
    // If tables exist, try running migrations
    else if (runMigrations) {
      console.log('[Server] Running pending migrations if any...');
      try {
        const pending = await AppDataSource.showMigrations();
        if (pending) {
          await AppDataSource.runMigrations();
          console.log('[Server] ✓ Migrations executed');
        } else {
          console.log('[Server] No pending migrations');
        }
      } catch (migErr: any) {
        console.error('[Server] ✗ Migration error:', migErr.message);
        // Check if it's a missing table error
        if (migErr.code === '42P01' || migErr.message?.includes('does not exist')) {
          console.error('[Server]    This migration requires base tables that don\'t exist.');
          console.error('[Server]    Set DB_SYNC=true to create tables from entities first.');
        }
      }
    } else {
      console.log('[Server] RUN_MIGRATIONS set to false, skipping migrations');
    }

    // Final verification
    if (missingTables.length === 0 && !AppDataSource.options.synchronize) {
      try {
        const queryRunner = AppDataSource.createQueryRunner();
        const essentialTables = ['users', 'students', 'classes', 'teachers'];
        const stillMissing: string[] = [];
        
        for (const table of essentialTables) {
          const exists = await queryRunner.hasTable(table);
          if (!exists) {
            stillMissing.push(table);
          }
        }
        
        await queryRunner.release();
        
        if (stillMissing.length === 0) {
          console.log('[Server] ✓ Essential database tables verified');
        } else {
          console.warn('[Server] ⚠️  Some tables still missing:', stillMissing.join(', '));
        }
      } catch (checkError) {
        // Ignore check errors at this point
      }
    }

    console.log('[Server] Starting HTTP server on port', PORT);
    app.listen(PORT, () => console.log(`[Server] ✓ Server running on port ${PORT}`));
}

// Start the initialization process
initializeDatabase().catch((error) => {
  console.error('[Server] ✗ FATAL: Failed to initialize:', error);
  process.exit(1);
});
