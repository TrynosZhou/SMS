import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('[DB Config] Creating DataSource using DATABASE_URL');

export const AppDataSource = new DataSource({
  type: 'postgres',

  // Use the full connection string exactly as provided by Render
  url: process.env.DATABASE_URL,

  // Required for Render PostgreSQL
  ssl: {
    rejectUnauthorized: false,
  },

  // IMPORTANT: use compiled JS paths in production
  entities: ['dist/entities/**/*.js'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],

  // Never use synchronize in production
  synchronize: false,

  // Helpful logging during debugging (optional)
  logging: process.env.NODE_ENV !== 'production',
});
