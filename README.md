# School Management System

A comprehensive school management system built with Angular (frontend), Node.js (backend), TypeORM, and PostgreSQL.

## Features

### 1. Student Management
- Student registration and enrollment
- View and manage student information
- Class assignment

### 2. Exam Management
- Create exams (Mid-term, End-term, Assignment, Quiz)
- Teachers can login and capture marks with comments
- Automatic calculation of:
  - Class position
  - Subject position
  - Form position
- Report card generation viewable by:
  - Administrators (all students)
  - Teachers (their classes)
  - Parents (only their linked students)

### 3. Finance Management
- Student invoicing
- Automatic balance calculation (previous balance + new term fees)
- Payment tracking
- Invoice status management (Pending, Paid, Partial, Overdue)

### 4. Teacher Management
- Teacher registration
- Account management
- Subject and class assignment

## Tech Stack

- **Frontend**: Angular 16
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Authentication**: JWT

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher) OR Docker Desktop
- npm or yarn

### Quick Setup Options

**Option 1: Docker (Recommended)**
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Setup backend
cd backend
copy .env.example .env  # Linux/Mac: cp .env.example .env
npm install
npm run setup-db
npm run dev

# Setup frontend (new terminal)
cd frontend
npm install
npm start
```

**Option 2: Local PostgreSQL**
See detailed instructions below.

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create `.env` file from example:
```bash
copy .env.example .env  # Windows
# or
cp .env.example .env    # Linux/Mac
```

3. Install dependencies:
```bash
npm install
```

4. Setup Database:

   **With Docker:**
   ```bash
   # Make sure PostgreSQL container is running
   docker-compose up -d postgres
   
   # Create database
   npm run setup-db
   ```

   **Without Docker:**
   ```sql
   CREATE DATABASE sms_db;
   ```
   Then run: `npm run setup-db`

5. Start the backend server:
```bash
npm run dev
```

The backend will run on `http://localhost:3000`

**Note:** The `.env.example` file includes default configurations. For Docker setup, the defaults work out of the box. For local PostgreSQL, update `DB_PASSWORD` in `.env` to match your PostgreSQL password.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:4200`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get student by ID
- `POST /api/students` - Create student
- `PUT /api/students/:id` - Update student
- `POST /api/students/enroll` - Enroll student in class

### Teachers
- `GET /api/teachers` - Get all teachers
- `GET /api/teachers/:id` - Get teacher by ID
- `POST /api/teachers` - Create teacher
- `PUT /api/teachers/:id` - Update teacher

### Exams
- `GET /api/exams` - Get all exams
- `POST /api/exams` - Create exam
- `POST /api/exams/marks` - Capture marks
- `GET /api/exams/marks` - Get marks
- `GET /api/exams/rankings/class` - Get class rankings
- `GET /api/exams/rankings/subject` - Get subject rankings
- `GET /api/exams/rankings/form` - Get form rankings
- `GET /api/exams/report-card` - Get report card

### Finance
- `GET /api/finance` - Get all invoices
- `POST /api/finance` - Create invoice
- `PUT /api/finance/:id/payment` - Update payment
- `POST /api/finance/calculate-balance` - Calculate next term balance

## User Roles

- **Admin**: Full access to all features
- **Teacher**: Can capture marks, view report cards for their classes
- **Parent**: Can only view report cards and invoices for their linked students
- **Student**: Basic access (can be extended)

## Database Schema

The system uses the following main entities:
- Users (with role-based access)
- Students
- Teachers
- Parents
- Classes
- Subjects
- Exams
- Marks
- Invoices

## Development

### Backend Development
```bash
cd backend
npm run dev  # Runs with nodemon for auto-reload
```

### Frontend Development
```bash
cd frontend
npm start  # Runs Angular dev server
```

## Production Build

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
# Serve the dist/sms-frontend directory
```

## License

This project is open source and available for educational purposes.

