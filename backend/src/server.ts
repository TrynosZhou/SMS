import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AppDataSource } from './config/database';
import routes from './routes';

// Load environment variables (only if not already set, e.g., in production)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\nPlease set these environment variables before starting the server.');
  process.exit(1);
}

// Validate JWT_SECRET strength
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters long for security.');
  console.warn('   Consider generating a stronger secret.');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files for uploaded student photos
app.use('/uploads/students', express.static('uploads/students'));

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'School Management System API' });
});

// Debug route to test exam routes
app.get('/api/exams/test', (req, res) => {
  res.json({ message: 'Exam routes are working', path: req.path });
});

// Handle 404 for unknown routes
app.use((req, res) => {
  // Ignore source map requests and other non-API requests
  // Only ignore if it's clearly a source map (ends with .map) or has repo_ prefix (not report-card)
  if (req.path.endsWith('.map') || (req.path.includes('repo_') && !req.path.includes('report-card')) || !req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'Not found' });
  }
  console.log('404 - Route not found:', req.method, req.path);
  res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
});

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

