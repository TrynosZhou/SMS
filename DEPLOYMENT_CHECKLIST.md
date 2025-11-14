# Deployment Readiness Checklist ✅

## Pre-Deployment Checklist

### ✅ Code Updates
- [x] All services use environment variables for API URLs
- [x] JWT_SECRET is required (no insecure fallbacks)
- [x] Environment variable validation at server startup
- [x] Production environment files configured
- [x] Build configurations updated

### 📋 Before Deploying

#### 1. GitHub Repository
- [ ] Repository created on GitHub
- [ ] Code pushed to GitHub
- [ ] `.env` files are in `.gitignore` (should not be committed)

#### 2. Environment Variables Prepared
- [ ] **JWT_SECRET** generated (32+ characters)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Database credentials ready (from Render)
- [ ] Backend URL ready (for frontend)

#### 3. Render.com Setup
- [ ] PostgreSQL database created
- [ ] Database credentials copied
- [ ] Backend web service configured
- [ ] All environment variables set in Render

#### 4. Vercel.com Setup
- [ ] Frontend project created
- [ ] API_URL environment variable set
- [ ] Build configuration verified

## Required Environment Variables

### Backend (Render)
```
PORT=10000
NODE_ENV=production
DB_HOST=<from-render-database>
DB_PORT=5432
DB_USERNAME=<from-render-database>
DB_PASSWORD=<from-render-database>
DB_NAME=sms_db
JWT_SECRET=<REQUIRED: 32+ characters>
JWT_EXPIRES_IN=7d
```

### Frontend (Vercel)
```
API_URL=https://your-backend-url.onrender.com/api
```

## Post-Deployment Steps

1. **Verify Backend Health**
   - Visit: `https://your-backend.onrender.com/health`
   - Should return: `{"status":"OK","message":"School Management System API"}`

2. **Initialize Database**
   - Go to Render backend → Shell
   - Run: `npm run setup-db`

3. **Create Admin User**
   - In Render backend shell
   - Run: `npm run create-admin`
   - Follow prompts

4. **Test Frontend**
   - Visit your Vercel URL
   - Try logging in with admin credentials

## Security Checklist

- [x] JWT_SECRET is required (no defaults)
- [x] JWT_SECRET is at least 32 characters
- [x] No hardcoded secrets in code
- [x] Environment variables not committed to Git
- [x] CORS configured properly
- [x] HTTPS enabled (automatic on Render/Vercel)

## Troubleshooting

### Server Won't Start
- Check Render logs for missing environment variables
- Verify JWT_SECRET is set and 32+ characters
- Check database connection credentials

### Frontend Can't Connect
- Verify API_URL in Vercel matches backend URL
- Check CORS settings in backend
- Verify backend is running (check /health endpoint)

### Database Connection Failed
- Use Internal Database URL (not External) on Render
- Verify all DB_* environment variables are correct
- Check database is running on Render

## Quick Commands

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Test Backend Locally:**
```bash
cd backend
npm install
npm run build
npm start
```

**Test Frontend Locally:**
```bash
cd frontend
npm install
npm run build
```

## Ready to Deploy! 🚀

Follow `QUICK_DEPLOY.md` or `DEPLOYMENT_GUIDE.md` for detailed steps.

