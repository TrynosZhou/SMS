import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AppDataSource } from './config/database';
import routes from './routes';

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
app.use(cors());
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
const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log('Database connected successfully');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to database:', error);
    process.exit(1);
  });
