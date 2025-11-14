# Pre-Launch Checklist

Use this checklist to ensure everything is set up correctly before running the application.

## ✅ Backend Setup

- [ ] Node.js installed (v18 or higher)
- [ ] PostgreSQL installed and running
- [ ] Database `sms_db` created
- [ ] Backend dependencies installed (`cd backend && npm install`)
- [ ] `.env` file created in `backend/` directory with:
  - [ ] `PORT=3000`
  - [ ] `DB_HOST=localhost`
  - [ ] `DB_PORT=5432`
  - [ ] `DB_USERNAME=postgres` (or your PostgreSQL username)
  - [ ] `DB_PASSWORD=your_password` (your PostgreSQL password)
  - [ ] `DB_NAME=sms_db`
  - [ ] `JWT_SECRET=your_secret_key`
  - [ ] `JWT_EXPIRES_IN=7d`

## ✅ Frontend Setup

- [ ] Angular CLI installed globally (optional, but recommended)
- [ ] Frontend dependencies installed (`cd frontend && npm install`)
- [ ] API URL configured correctly in services (default: `http://localhost:3000/api`)

## ✅ Database

- [ ] PostgreSQL service is running
- [ ] Database `sms_db` exists
- [ ] Database user has proper permissions
- [ ] Connection credentials are correct in `.env`

## ✅ Testing

- [ ] Backend starts without errors (`npm run dev` in backend/)
- [ ] Frontend starts without errors (`npm start` in frontend/)
- [ ] Backend health check works: `http://localhost:3000/health`
- [ ] Frontend loads: `http://localhost:4200`
- [ ] Can create admin user via API or database

## ✅ Initial Data (After First Login)

- [ ] Admin user created
- [ ] At least one Class created
- [ ] At least one Subject created
- [ ] At least one Teacher created (optional for testing)
- [ ] At least one Student created (optional for testing)

## 🚨 Common Issues to Check

- [ ] Port 3000 is not in use by another application
- [ ] Port 4200 is not in use by another application
- [ ] Firewall is not blocking ports 3000 or 4200
- [ ] CORS is enabled in backend (already configured)
- [ ] All environment variables are set correctly
- [ ] No typos in `.env` file

## 📝 Quick Verification Commands

**Check Node.js version:**
```bash
node --version
```

**Check PostgreSQL is running:**
```bash
# Windows
sc query postgresql-x64-XX

# Linux/Mac
sudo service postgresql status
```

**Test database connection:**
```bash
psql -U postgres -d sms_db -c "SELECT version();"
```

**Check if ports are available:**
```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :4200

# Linux/Mac
lsof -i :3000
lsof -i :4200
```

## ✅ Ready to Launch!

Once all items are checked, you're ready to:
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Create admin user
4. Login and start using the system!

---

**Need help?** Check `SETUP.md` or `QUICK_START.md` for detailed instructions.

