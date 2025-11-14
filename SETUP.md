# School Management System - Complete Setup Guide

## Prerequisites

Before starting, ensure you have the following installed:
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **PostgreSQL** (v12 or higher) - [Download](https://www.postgresql.org/download/)
- **npm** (comes with Node.js) or **yarn**

## Step 1: Database Setup

1. **Start PostgreSQL service**
   - On Windows: Start PostgreSQL service from Services
   - On Linux/Mac: `sudo service postgresql start` or `brew services start postgresql`

2. **Create the database**
   ```sql
   -- Connect to PostgreSQL
   psql -U postgres

   -- Create database
   CREATE DATABASE sms_db;

   -- Exit psql
   \q
   ```

## Step 2: Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   Create a file named `.env` in the `backend` directory:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=your_postgres_password
   DB_NAME=sms_db
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRES_IN=7d
   ```

   **Important**: Replace `your_postgres_password` with your actual PostgreSQL password.

4. **Start the backend server**
   ```bash
   npm run dev
   ```

   You should see:
   ```
   Database connected successfully
   Server running on port 3000
   ```

   The backend API is now running at `http://localhost:3000`

## Step 3: Frontend Setup

1. **Open a new terminal** and navigate to frontend directory
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

   The application will automatically open at `http://localhost:4200`

## Step 4: Initial Setup (First Time)

1. **Create an Admin User**
   You'll need to create an admin user. You can do this by:
   
   **Option A: Using the registration endpoint**
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@school.com",
       "password": "admin123",
       "role": "admin",
       "firstName": "Admin",
       "lastName": "User"
     }'
   ```

   **Option B: Directly in the database** (after first login with any user)
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your_email@example.com';
   ```

2. **Login to the system**
   - Go to `http://localhost:4200`
   - Use the admin credentials you just created
   - You'll be redirected to the dashboard

3. **Create Initial Data**
   - Create Classes (e.g., "Form 1A", "Form 1B")
   - Create Subjects (e.g., "Mathematics", "English", "Science")
   - Create Teachers
   - Create Students
   - Link Students to Parents (if needed)

## Step 5: Verify Installation

1. **Backend Health Check**
   Visit: `http://localhost:3000/health`
   Should return: `{"status":"OK","message":"School Management System API"}`

2. **Frontend**
   Visit: `http://localhost:4200`
   Should show the login page

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in `.env` file
- Ensure database `sms_db` exists
- Check if port 5432 is available

### Backend Issues
- Check if port 3000 is available
- Verify all dependencies are installed: `npm install`
- Check console for error messages
- Ensure `.env` file exists and is properly configured

### Frontend Issues
- Clear browser cache
- Check if backend is running on port 3000
- Verify API URL in service files matches backend port
- Check browser console for errors

### Common Errors

**"Cannot find module"**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**"Port already in use"**
- Change PORT in `.env` (backend) or use `ng serve --port 4201` (frontend)

**"Database connection failed"**
- Verify PostgreSQL is running
- Check database credentials
- Ensure database exists

## Development Workflow

1. **Backend Development**
   ```bash
   cd backend
   npm run dev  # Auto-reloads on file changes
   ```

2. **Frontend Development**
   ```bash
   cd frontend
   npm start  # Auto-reloads on file changes
   ```

3. **Making Changes**
   - Backend changes: Server auto-reloads
   - Frontend changes: Browser auto-refreshes
   - Database changes: TypeORM will sync automatically (in development)

## Production Deployment

### Backend
```bash
cd backend
npm run build
npm start
```

### Frontend
```bash
cd frontend
npm run build
# Serve the dist/sms-frontend directory with a web server
```

## Support

For issues or questions:
1. Check the console logs for error messages
2. Verify all prerequisites are installed
3. Ensure database is properly configured
4. Check that all environment variables are set correctly

