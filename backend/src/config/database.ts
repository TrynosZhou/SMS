import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
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

// Load environment variables from .env file
// Always try to load .env file, but system env vars take precedence
const envResult = dotenv.config();
if (envResult.error) {
  console.log('[DB Config] No .env file found or error loading it:', envResult.error.message);
} else {
  console.log('[DB Config] .env file loaded successfully');
}

console.log('[DB Config] Creating DataSource configuration...');
console.log('[DB Config] Node version:', process.version);
console.log('[DB Config] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB Config] Module type check - typeof exports:', typeof exports);
console.log('[DB Config] Module type check - typeof module:', typeof module);

console.log('[DB Config] Preparing entity list...');
// Try using entity classes first, fallback to paths if needed
const entities = [User, Student, Teacher, Class, Subject, Exam, Marks, Invoice, Parent, Settings, ReportCardRemarks, Message, UniformItem, InvoiceUniformItem, Attendance, PromotionRule, RecordBook, StudentTransfer, Timetable, TimetableEntry, TimetableConfig, TimetableVersion, TimetableChangeLog];
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
  const entityPaths = process.env.NODE_ENV === 'production'
    ? ['dist/entities/**/*.js']
    : ['src/entities/**/*.ts'];
  const migrationsPath = process.env.NODE_ENV === 'production' 
    ? ['dist/migrations/**/*.js'] 
    : ['src/migrations/**/*.ts'];
  const subscribersPath = process.env.NODE_ENV === 'production'
    ? ['dist/subscribers/**/*.js']
    : ['src/subscribers/**/*.ts'];
  
  console.log('[DB Config] Using entity paths:', entityPaths);
  console.log('[DB Config] Migrations path:', migrationsPath);
  console.log('[DB Config] Subscribers path:', subscribersPath);
  
  // Check if DATABASE_URL is provided (common in cloud platforms)
  let dbHost: string;
  let dbPort: number;
  let dbUsername: string;
  let dbName: string;
  let dbPassword: string;

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
  const shouldSync = (process.env.DB_SYNC || '').toLowerCase() === 'true' && process.env.NODE_ENV !== 'production';

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
  const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'); // 30 seconds default
  const poolSize = parseInt(process.env.DB_POOL_SIZE || '10'); // Default pool size
  const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30000'); // 30 seconds
  
  console.log('[DB Config]   Connection timeout:', connectionTimeout, 'ms');
  console.log('[DB Config]   Pool size:', poolSize);
  console.log('[DB Config]   Idle timeout:', idleTimeout, 'ms');
  
  // Build SSL configuration
  let sslConfig: any = false;
  if (useSSL) {
    sslConfig = {
      rejectUnauthorized: false, // Render / many hosted PG providers require SSL; disable cert check for managed CA
      // Additional SSL options for better compatibility
      require: true,
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
  };
  
  // Add SSL to extra if needed (for pg library compatibility)
  if (useSSL) {
    extraConfig.ssl = sslConfig;
  }
  
  AppDataSource = new DataSource({
    type: 'postgres',
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbName,
    synchronize: shouldSync,
    logging: false,
    entities: entityPaths,
    migrations: migrationsPath,
    subscribers: subscribersPath,
    ssl: sslConfig,
    // Connection pool and timeout settings
    extra: extraConfig,
  });
  
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

