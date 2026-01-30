import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Exam } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Invoice } from '../entities/Invoice';
import { Parent } from '../entities/Parent';
import { Settings } from '../entities/Settings';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Message } from '../entities/Message';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { Attendance } from '../entities/Attendance';
import { PromotionRule } from '../entities/PromotionRule';
import { RecordBook } from '../entities/RecordBook';
import { StudentTransfer } from '../entities/StudentTransfer';
import { Timetable } from '../entities/Timetable';
import { TimetableEntry } from '../entities/TimetableEntry';
import { TimetableConfig } from '../entities/TimetableConfig';
import { TimetableVersion } from '../entities/TimetableVersion';
import { TimetableChangeLog } from '../entities/TimetableChangeLog';
import { TeacherClass } from '../entities/TeacherClass';

// Load environment variables from .env file (backend folder so it works regardless of cwd)
const backendRoot = path.resolve(__dirname, '../..');
const envPath = path.join(backendRoot, '.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  const fallback = dotenv.config();
  if (fallback.error) {
    console.log('[DB Config] No .env file found or error loading it:', envResult.error.message);
  } else {
    console.log('[DB Config] .env file loaded from cwd');
  }
} else {
  console.log('[DB Config] .env file loaded from backend root:', envPath);
}

console.log('[DB Config] Creating DataSource configuration...');
console.log('[DB Config] Node version:', process.version);
console.log('[DB Config] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB Config] Module type check - typeof exports:', typeof exports);
console.log('[DB Config] Module type check - typeof module:', typeof module);

console.log('[DB Config] Preparing entity list...');
// Try using entity classes first, fallback to paths if needed
const entities = [User, Student, Teacher, Class, Subject, Exam, Marks, Invoice, Parent, Settings, ReportCardRemarks, Message, UniformItem, InvoiceUniformItem, Attendance, PromotionRule, RecordBook, StudentTransfer, Timetable, TimetableEntry, TimetableConfig, TimetableVersion, TimetableChangeLog, TeacherClass];
console.log('[DB Config] Entity count:', entities.length);
console.log('[DB Config] Entity names:', entities.map(e => e?.name || 'unknown').join(', '));
console.log('[DB Config] Checking each entity...');
entities.forEach((entity, index) => {
  try {
    console.log(`[DB Config] Entity ${index + 1}: ${entity?.name || 'unknown'} - OK`);
  } catch (err: any) {
    console.error(`[DB Config] Entity ${index + 1}: ERROR -`, err?.message);
  }
});

console.log('[DB Config] Creating DataSource instance...');
let AppDataSource: DataSource;
try {
  // Detect if running from compiled dist folder
  // Check multiple ways to detect production/compiled mode
  const isRunningFromDist = (() => {
    try {
      // Method 1: Check NODE_ENV
      if (process.env.NODE_ENV === 'production') return true;
      
      // Method 2: Check if __dirname contains 'dist' (CommonJS)
      if (typeof __dirname !== 'undefined' && __dirname.includes('dist')) return true;
      
      // Method 3: Check require.main filename (where the script was executed from)
      if (require.main && require.main.filename && require.main.filename.includes('dist')) return true;
      
      // Method 4: Check current working directory
      if (process.cwd().includes('dist')) return true;
      
      // Method 5: Check if we can find dist folder (fallback)
      const fs = require('fs');
      const path = require('path');
      const distPath = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'server.js'))) {
        // If dist/server.js exists and we're running server.js, we're likely in production
        if (require.main && require.main.filename && require.main.filename.endsWith('dist/server.js')) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      // If any check fails, default to development mode
      return false;
    }
  })();
  
  // Use entity classes directly (more reliable than file paths)
  // When running from dist: skip migrations/subscribers path loading at runtime to avoid
  // Node loading ESM (causing "Unexpected token 'export'"). Run migrations via CLI if needed.
  const path = require('path');
  const migrationsPath = isRunningFromDist ? [] : ['src/migrations/**/*.ts'];
  const subscribersPath = isRunningFromDist ? [] : ['src/subscribers/**/*.ts'];
  
  console.log('[DB Config] Production mode detected:', isRunningFromDist);
  console.log('[DB Config] NODE_ENV:', process.env.NODE_ENV);
  
  console.log('[DB Config] Using entity classes directly (', entities.length, 'entities)');
  console.log('[DB Config] Migrations at runtime:', isRunningFromDist ? 'disabled (run via CLI)' : migrationsPath);
  console.log('[DB Config] Subscribers at runtime:', isRunningFromDist ? 'disabled' : subscribersPath);
  
  // Check if DATABASE_URL is provided (common in cloud platforms)
  let dbHost: string;
  let dbPort: number;
  let dbUsername: string;
  let dbName: string;
  let dbPassword: string;
  let fixedDatabaseUrl: string | null = null; // Store fixed URL for direct use

  if (process.env.DATABASE_URL) {
    // Parse DATABASE_URL if provided (format: postgresql://user:password@host:port/database)
    try {
      let databaseUrl = process.env.DATABASE_URL;
      
      // Check if hostname in DATABASE_URL is incomplete (missing domain)
      // This can happen if Render provides incomplete hostname
      const urlMatch = databaseUrl.match(/@([^:]+):/);
      if (urlMatch && urlMatch[1].startsWith('dpg-') && !urlMatch[1].includes('.')) {
        console.warn('[DB Config] ⚠️  WARNING: DATABASE_URL has incomplete hostname!');
        console.warn('[DB Config]    Incomplete hostname:', urlMatch[1]);
        console.warn('[DB Config]    Attempting to fix by adding domain suffix...');
        
        // Try to fix by adding the domain suffix
        const incompleteHost = urlMatch[1];
        const fixedHost = `${incompleteHost}.oregon-postgres.render.com`;
        databaseUrl = databaseUrl.replace(`@${incompleteHost}:`, `@${fixedHost}:`);
        console.log('[DB Config]    Fixed hostname:', fixedHost);
        console.log('[DB Config]    Updated DATABASE_URL (hostname only, password hidden)');
      }
      
      // Store the fixed URL for potential direct use
      fixedDatabaseUrl = databaseUrl;
      
      const url = new URL(databaseUrl);
      dbHost = url.hostname;
      dbPort = parseInt(url.port || '5432');
      dbUsername = url.username;
      dbPassword = url.password;
      dbName = url.pathname.slice(1); // Remove leading '/'
      console.log('[DB Config] ✅ Using DATABASE_URL connection string');
      console.log('[DB Config]   Parsed hostname:', dbHost);
      console.log('[DB Config]   Parsed username:', dbUsername);
      console.log('[DB Config]   Parsed database:', dbName);
    } catch (error) {
      console.error('[DB Config] ❌ Failed to parse DATABASE_URL');
      console.error('[DB Config]   DATABASE_URL value (first 50 chars):', process.env.DATABASE_URL?.substring(0, 50) + '...');
      console.error('[DB Config]   Error:', (error as Error).message);
      console.error('[DB Config]   Falling back to individual env vars');
      dbHost = process.env.DB_HOST || 'localhost';
      dbPort = parseInt(process.env.DB_PORT || '5432');
      dbUsername = process.env.DB_USERNAME || 'postgres';
      dbName = process.env.DB_NAME || 'sms_db';
      dbPassword = String(process.env.DB_PASSWORD || '');
    }
  } else {
    // Use individual environment variables
    dbHost = process.env.DB_HOST || 'localhost';
    dbPort = parseInt(process.env.DB_PORT || '5432');
    dbUsername = process.env.DB_USERNAME || 'postgres';
    dbName = process.env.DB_NAME || 'sms_db';
    dbPassword = String(process.env.DB_PASSWORD || '');
  }

  // Validate hostname - check for incomplete Render.com hostnames
  if (dbHost.startsWith('dpg-') && !dbHost.includes('.')) {
    const errorMessage = `[DB Config] ❌ ERROR: Database hostname is incomplete!
[DB Config]    Current hostname: ${dbHost}
[DB Config]    Render.com hostnames must include the full domain suffix.
[DB Config]    Expected format: dpg-xxxxx-a.oregon-postgres.render.com
[DB Config]    
[DB Config]    Debug info:
[DB Config]    - DATABASE_URL was ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}
[DB Config]    - DB_HOST was ${process.env.DB_HOST ? `SET to: ${process.env.DB_HOST}` : 'NOT SET'}
[DB Config]    - Source: ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'DB_HOST'}
[DB Config]    
[DB Config]    To fix this:
[DB Config]    1. If using DATABASE_URL, ensure it includes the full hostname with domain
[DB Config]    2. If using DB_HOST, update it to include the domain suffix
[DB Config]    3. In Render.com dashboard, copy the complete Internal Database URL
[DB Config]    4. Expected format: dpg-xxxxx-a.oregon-postgres.render.com
[DB Config]    
[DB Config]    Example of correct format:
[DB Config]    DATABASE_URL=postgresql://user:pass@dpg-xxxxx-a.oregon-postgres.render.com:5432/dbname
[DB Config]    or
[DB Config]    DB_HOST=dpg-xxxxx-a.oregon-postgres.render.com`;
    console.error(errorMessage);
    throw new Error(`Database hostname is incomplete: ${dbHost}. Please provide the full hostname with domain suffix.`);
  }

  // Validate hostname format - warn for other incomplete hostnames
  if (dbHost && !dbHost.includes('.') && dbHost !== 'localhost' && !dbHost.startsWith('127.')) {
    console.warn('[DB Config] ⚠️  Hostname does not contain a domain - this may cause DNS resolution issues');
    console.warn('[DB Config]    Current hostname:', dbHost);
  }
  
  const hasPassword = !!dbPassword;
  // Sync: in development default to true (so tables are created); in production only if DB_SYNC=true
  const dbSyncRaw = (process.env.DB_SYNC || '').toLowerCase().trim();
  const explicitlyTrue = ['true', '1', 'yes', 'on'].includes(dbSyncRaw);
  const explicitlyFalse = ['false', '0', 'no', 'off'].includes(dbSyncRaw);
  const isProduction = process.env.NODE_ENV === 'production';
  const shouldSync = explicitlyTrue || (!isProduction && !explicitlyFalse);
  console.log('[DB Config]   NODE_ENV:', process.env.NODE_ENV ?? '(not set)', '| DB_SYNC:', process.env.DB_SYNC ?? '(not set)', '→ synchronize:', shouldSync);
  if (shouldSync && isProduction) {
    console.warn('[DB Config] ⚠️  DB_SYNC enabled in production: tables will be auto-created/updated. Set DB_SYNC=false after first run if desired.');
  }

  // SSL: auto-enable for hosted DBs unless explicitly disabled
  const sslEnv = (process.env.DB_SSL || '').toLowerCase();
  const isLocalHost =
    dbHost === 'localhost' ||
    dbHost.startsWith('127.') ||
    dbHost.startsWith('10.') ||
    dbHost.startsWith('192.168.');
  const isHosted = !isLocalHost;
  const useSSL =
    sslEnv === 'true' ||
    (sslEnv !== 'false' && (process.env.NODE_ENV === 'production' || isHosted));
  
  console.log('[DB Config] Database connection settings:');
  console.log('[DB Config]   DB_HOST:', dbHost);
  console.log('[DB Config]   DB_PORT:', dbPort);
  console.log('[DB Config]   DB_USERNAME:', dbUsername);
  console.log('[DB Config]   DB_NAME:', dbName);
  console.log('[DB Config]   DB_PASSWORD:', hasPassword ? '*** (set)' : '*** (not set)');
  console.log('[DB Config]   NODE_ENV:', process.env.NODE_ENV);
  console.log('[DB Config]   SSL enabled:', useSSL, '(source:', sslEnv || (isHosted ? 'auto-hosted' : 'auto-env'), ')');
  console.log('[DB Config]   Synchronize schema:', shouldSync);
  
  // Connection pool and timeout settings
  // Increased timeout for Render.com databases which may have slower initial connections
  // Render free tier databases can take 30-90 seconds to wake up from paused state
  const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || (isHosted ? '90000' : '60000')); // 90s for hosted, 60s for local
  const poolSize = parseInt(process.env.DB_POOL_SIZE || '10'); // Default pool size
  const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30000'); // 30 seconds
  
  console.log('[DB Config]   Connection timeout:', connectionTimeout, 'ms');
  console.log('[DB Config]   Pool size:', poolSize);
  console.log('[DB Config]   Idle timeout:', idleTimeout, 'ms');
  
  // Build SSL configuration - enhanced for Render.com compatibility
  let sslConfig: any = false;
  if (useSSL) {
    sslConfig = {
      rejectUnauthorized: false, // Render / many hosted PG providers require SSL; disable cert check for managed CA
      // Additional SSL options for better compatibility with Render.com
      require: true,
      // Explicitly set SSL mode for better compatibility
      sslmode: 'require',
    };
  }
  
  // Build extra configuration for connection pool
  const extraConfig: any = {
    // Connection pool configuration
    max: poolSize, // Maximum number of clients in the pool
    min: 2, // Minimum number of clients in the pool
    idleTimeoutMillis: idleTimeout, // Close idle clients after this many milliseconds
    connectionTimeoutMillis: connectionTimeout, // Return an error after this many milliseconds if connection could not be established
    // Keep-alive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // Start sending keep-alive packets after 10 seconds
    // Additional options for better connection reliability
    statement_timeout: 60000, // 60 seconds for query timeout (increased for hosted DBs)
    query_timeout: 60000,
    // Additional timeout settings for Render.com compatibility
    connect_timeout: isHosted ? 90 : 30, // Connection timeout in seconds
  };
  
  // Add SSL to extra if needed (for pg library compatibility)
  if (useSSL) {
    extraConfig.ssl = sslConfig;
  }
  
  // Try using connection string directly if DATABASE_URL is available (better for Render.com)
  // This avoids potential hostname resolution issues and is more reliable for hosted databases
  // Always prefer connection string for hosted databases, regardless of synchronize setting
  let dataSourceConfig: any;
  
  if (fixedDatabaseUrl && isHosted) {
    // Use connection string directly - TypeORM supports this and it's more reliable for hosted DBs
    // This method avoids DNS resolution issues and uses the connection string as-is
    console.log('[DB Config] Using DATABASE_URL connection string directly (recommended for hosted databases)');
    
    // Add SSL parameters to the connection string if SSL is required
    let connectionUrl = fixedDatabaseUrl;
    if (useSSL && !connectionUrl.includes('?ssl=') && !connectionUrl.includes('?sslmode=')) {
      // Append SSL parameters to the connection string
      const separator = connectionUrl.includes('?') ? '&' : '?';
      connectionUrl = `${connectionUrl}${separator}sslmode=require`;
    }
    
    dataSourceConfig = {
      type: 'postgres',
      url: connectionUrl,
      synchronize: shouldSync,
      logging: false,
      entities: entities, // Use entity classes directly
      migrations: migrationsPath,
      subscribers: subscribersPath,
      ssl: sslConfig,
      extra: extraConfig,
    };
  } else if (fixedDatabaseUrl) {
    // Use connection string even for local if available (more reliable)
    console.log('[DB Config] Using DATABASE_URL connection string (local database)');
    
    let connectionUrl = fixedDatabaseUrl;
    if (useSSL && !connectionUrl.includes('?ssl=') && !connectionUrl.includes('?sslmode=')) {
      const separator = connectionUrl.includes('?') ? '&' : '?';
      connectionUrl = `${connectionUrl}${separator}sslmode=require`;
    }
    
    dataSourceConfig = {
      type: 'postgres',
      url: connectionUrl,
      synchronize: shouldSync,
      logging: false,
      entities: entities, // Use entity classes directly
      migrations: migrationsPath,
      subscribers: subscribersPath,
      ssl: sslConfig,
      extra: extraConfig,
    };
  } else {
    // Fallback to individual parameters
    console.log('[DB Config] Using individual connection parameters');
    dataSourceConfig = {
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUsername,
      password: dbPassword,
      database: dbName,
      synchronize: shouldSync,
      logging: false,
      entities: entities, // Use entity classes directly
      migrations: migrationsPath,
      subscribers: subscribersPath,
      ssl: sslConfig,
      extra: extraConfig,
    };
  }
  
  AppDataSource = new DataSource(dataSourceConfig);
  
  // Add connection error handlers for better reliability (after initialization)
  // Note: Pool is only available after DataSource is initialized, so we'll set this up in server.ts
  
  console.log('[DB Config] DataSource created successfully');
  console.log('[DB Config] DataSource.isInitialized:', AppDataSource.isInitialized);
} catch (error: any) {
  console.error('[DB Config] ✗ ERROR creating DataSource:');
  console.error('[DB Config] Error type:', error?.constructor?.name);
  console.error('[DB Config] Error message:', error?.message);
  console.error('[DB Config] Error code:', error?.code);
  console.error('[DB Config] Error stack:', error?.stack);
  if (error?.cause) {
    console.error('[DB Config] Error cause:', error.cause);
  }
  throw error;
}

export { AppDataSource };

