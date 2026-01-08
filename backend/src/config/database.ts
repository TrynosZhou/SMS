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
      const url = new URL(process.env.DATABASE_URL);
      dbHost = url.hostname;
      dbPort = parseInt(url.port || '5432');
      dbUsername = url.username;
      dbPassword = url.password;
      dbName = url.pathname.slice(1); // Remove leading '/'
      console.log('[DB Config] Using DATABASE_URL connection string');
    } catch (error) {
      console.error('[DB Config] Failed to parse DATABASE_URL, falling back to individual env vars');
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
[DB Config]    To fix this:
[DB Config]    1. Check your DATABASE_URL or DB_HOST environment variable
[DB Config]    2. Ensure the full hostname includes the domain (e.g., .oregon-postgres.render.com)
[DB Config]    3. In Render.com dashboard, copy the complete Internal Database URL or hostname
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
  
  console.log('[DB Config] Database connection settings:');
  console.log('[DB Config]   DB_HOST:', dbHost);
  console.log('[DB Config]   DB_PORT:', dbPort);
  console.log('[DB Config]   DB_USERNAME:', dbUsername);
  console.log('[DB Config]   DB_NAME:', dbName);
  console.log('[DB Config]   DB_PASSWORD:', hasPassword ? '*** (set)' : '*** (not set)');
  console.log('[DB Config]   NODE_ENV:', process.env.NODE_ENV);
  
  AppDataSource = new DataSource({
    type: 'postgres',
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbName,
    synchronize: false,
    logging: false,
    entities: entityPaths,
    migrations: migrationsPath,
    subscribers: subscribersPath,
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

