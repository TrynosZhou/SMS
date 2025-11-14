# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Option A: Using Docker (Recommended)

1. **Start PostgreSQL with Docker:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Configure Backend:**
   ```bash
   cd backend
   copy .env.example .env
   ```
   (On Linux/Mac: `cp .env.example .env`)
   
   The `.env` file is already configured for Docker setup.

3. **Setup Database:**
   ```bash
   npm install
   npm run setup-db
   ```

4. **Start Backend:**
   ```bash
   npm run dev
   ```

5. **Start Frontend** (new terminal):
   ```bash
   cd frontend
   npm install
   npm start
   ```

### Option B: Without Docker

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Setup PostgreSQL

**If using Docker:**
```bash
docker-compose up -d postgres
```

**If using local PostgreSQL:**
Make sure PostgreSQL is installed and running.

### 3. Configure Backend

Create `backend/.env` file:
```bash
cd backend
copy .env.example .env
```

Edit `.env` and update if needed (defaults work with Docker).

### 4. Setup Database

**Option A: Automatic (Recommended)**
```bash
cd backend
npm run setup-db
```

**Option B: Manual**
1. Make sure PostgreSQL is running
2. Create database:
   ```sql
   CREATE DATABASE sms_db;
   ```

### 5. Start Backend

```bash
cd backend
npm run dev
```

Wait for: `Database connected successfully` and `Server running on port 3000`

### 6. Start Frontend

Open a new terminal:
```bash
cd frontend
npm start
```

### 7. Create Admin User

**Option 1: Using Script (Recommended)**
```bash
cd backend
npm run create-admin admin admin123 admin@school.com
```

**Option 2: Using API**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@school.com",
    "password": "admin123",
    "role": "admin"
  }'
```

**Option 3: Using Database**
After registering any user, update their role:
```sql
UPDATE users SET role = 'admin', username = 'admin' WHERE email = 'your_email@example.com';
```

### 8. Login

1. Go to `http://localhost:4200`
2. Login with your admin credentials
3. Start creating classes, subjects, teachers, and students!

## 📋 Next Steps

1. **Create Classes**: Go to Classes section (or use API)
2. **Create Subjects**: Go to Subjects section (or use API)
3. **Create Teachers**: Teachers → Add Teacher
4. **Create Students**: Students → Add Student
5. **Create Exams**: Exams → Create Exam
6. **Enter Marks**: Exams → Select Exam → Enter Marks
7. **View Report Cards**: Report Cards → Select Student & Exam

## 🔧 Troubleshooting

**Backend won't start?**
- Check PostgreSQL is running
- Verify `.env` file exists and has correct credentials
- Check port 3000 is not in use

**Frontend won't start?**
- Check Node.js version (v18+)
- Delete `node_modules` and run `npm install` again
- Check port 4200 is not in use

**Can't connect to database?**
- Verify PostgreSQL credentials in `.env`
- Check database `sms_db` exists
- Ensure PostgreSQL service is running

## 📚 Full Documentation

See `SETUP.md` for detailed setup instructions.

