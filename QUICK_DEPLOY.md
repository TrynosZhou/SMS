# 🚀 Complete Deployment Guide

Deploy your School Management System to:
- **GitHub**: Source code repository
- **Render.com**: Backend API & PostgreSQL Database
- **Vercel.com**: Frontend application

---

## 📋 Prerequisites

Before starting, ensure you have:
- ✅ GitHub account ([Sign up](https://github.com/signup))
- ✅ Render.com account ([Sign up](https://render.com))
- ✅ Vercel.com account ([Sign up](https://vercel.com/signup))
- ✅ Git installed on your machine
- ✅ Node.js installed (for generating JWT secret)

---

## Step 1: Push Code to GitHub

### 1.1 Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the **"+"** icon → **"New repository"**
3. Repository name: `school-management-system` (or your preferred name)
4. Description: `School Management System - Full Stack Application`
5. Choose **Public** or **Private**
6. **⚠️ DO NOT** check "Initialize with README", "Add .gitignore", or "Choose a license"
7. Click **"Create repository"**

### 1.2 Initialize Git and Push Code

Open PowerShell or Terminal in your project directory:

```bash
# Navigate to project directory
cd C:\Users\DELL\Desktop\SMS

# Initialize git (if not already done)
git init

# Check if .gitignore exists (should ignore node_modules, .env, etc.)
# If not, create one with:
# node_modules/
# .env
# dist/
# *.log

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: School Management System"

# Add remote repository (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Note**: Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name.

### 1.3 Verify GitHub Push

1. Go to your GitHub repository
2. Verify all files are uploaded
3. Check that `.env` files are NOT included (they should be in `.gitignore`)

---

## Step 2: Deploy Database on Render.com

### 2.1 Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** button (top right)
3. Select **"PostgreSQL"**

### 2.2 Configure Database

Fill in the form:
- **Name**: `sms-database` (or your preferred name)
- **Database**: `sms_db` (or leave default)
- **User**: Leave default (auto-generated)
- **Region**: Choose closest to your users (e.g., `Oregon (US West)`)
- **PostgreSQL Version**: Latest stable (recommended)
- **Plan**: 
  - **Free**: 90 days trial, then $7/month
  - **Starter**: $7/month (recommended for production)
- Click **"Create Database"**

### 2.3 Wait for Database Provisioning

- Wait 2-3 minutes for database to be created
- Status will change from "Creating" to "Available"

### 2.4 Get Database Connection Details

1. Click on your database name (`sms-database`)
2. Go to **"Connections"** tab
3. You'll see:
   - **Internal Database URL**: Use this for Render services
   - **External Database URL**: Use this for local development
   
4. **Extract credentials from Internal Database URL:**
   - Format: `postgresql://username:password@hostname:port/database`
   - Example: `postgresql://sms_user:abc123@dpg-xxxxx-a.oregon-postgres.render.com:5432/sms_db`
   - Extract:
     - `DB_HOST`: `dpg-xxxxx-a.oregon-postgres.render.com`
     - `DB_PORT`: `5432`
     - `DB_USERNAME`: `sms_user`
     - `DB_PASSWORD`: `abc123`
     - `DB_NAME`: `sms_db`

**⚠️ Save these credentials - you'll need them for backend configuration!**

---

## Step 3: Deploy Backend on Render.com

### 3.1 Create Web Service

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub account (if not already connected)
3. Select your repository: `school-management-system`
4. Click **"Connect"**

### 3.2 Configure Backend Service

Fill in the configuration:

**Basic Settings:**
- **Name**: `sms-backend`
- **Environment**: `Node`
- **Region**: Same as database (for better performance)
- **Branch**: `main` (or your default branch)
- **Root Directory**: `backend` ⚠️ **Important!**
- **Runtime**: `Node` (auto-detected)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Environment Variables:**

Click **"Add Environment Variable"** and add each one:

```
PORT=10000
```

```
NODE_ENV=production
```

```
DB_HOST=<your-database-host>
```
(Example: `dpg-xxxxx-a.oregon-postgres.render.com`)

```
DB_PORT=5432
```

```
DB_USERNAME=<your-database-username>
```
(Example: `sms_user`)

```
DB_PASSWORD=<your-database-password>
```
(Example: `abc123` - from Internal Database URL)

```
DB_NAME=<your-database-name>
```
(Example: `sms_db`)

```
JWT_SECRET=<generate-strong-secret>
```

**⚠️ CRITICAL: Generate JWT_SECRET**

Run this command in your terminal to generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (64 characters) and use it as `JWT_SECRET`.

**Example:**
```
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

```
JWT_EXPIRES_IN=7d
```

### 3.3 Deploy Backend

1. Review all settings
2. Scroll down and click **"Create Web Service"**
3. Render will:
   - Clone your repository
   - Install dependencies (`npm install`)
   - Build TypeScript code (`npm run build`)
   - Start the server (`npm start`)
4. Wait 5-10 minutes for first deployment
5. Monitor the **"Logs"** tab for progress

### 3.4 Get Backend URL

Once deployed:
1. Your backend URL will be: `https://sms-backend.onrender.com`
2. **Copy this URL** - you'll need it for frontend configuration
3. Test backend: Visit `https://sms-backend.onrender.com/health`
   - Should return: `{"status":"OK","message":"School Management System API"}`

### 3.5 Initialize Database

After backend is deployed:

1. Go to your backend service (`sms-backend`)
2. Click **"Shell"** tab
3. Run database setup:
   ```bash
   npm run setup-db
   ```
4. Wait for completion (creates tables and schema)

### 3.6 Create Admin User

In the same Shell tab, run:

```bash
npm run create-admin
```

Follow the prompts:
- Enter admin username
- Enter admin email
- Enter admin password
- Confirm password

**Save these credentials** - you'll use them to log in!

---

## Step 4: Deploy Frontend on Vercel.com

### 4.1 Create Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Select: `school-management-system`
5. Click **"Import"**

### 4.2 Configure Frontend Build

**Framework Preset:**
- Select: **Angular** (auto-detected)

**Project Settings:**
- **Framework Preset**: `Angular`
- **Root Directory**: `frontend` ⚠️ **Important!**
- **Build Command**: `npm install && npm run build`
- **Output Directory**: `dist/sms-frontend`
- **Install Command**: `npm install` (default)

### 4.3 Add Environment Variables

Before deploying, add environment variable:

1. In the **"Environment Variables"** section
2. Click **"Add"**
3. Add:
   - **Key**: `API_URL`
   - **Value**: `https://your-backend-url.onrender.com/api`
   
   **Replace `your-backend-url.onrender.com` with your actual Render backend URL!**
   
   Example: `https://sms-backend.onrender.com/api`

4. Click **"Add"** to save

### 4.4 Deploy Frontend

1. Review all settings
2. Click **"Deploy"**
3. Vercel will:
   - Install dependencies
   - Build Angular application
   - Deploy to CDN
4. Wait 2-5 minutes for deployment
5. You'll get a URL like: `https://school-management-system.vercel.app`

### 4.5 Verify Frontend Deployment

1. Visit your Vercel URL
2. You should see the login page
3. Try logging in with your admin credentials

---

## Step 5: Update Frontend Environment Configuration

If your frontend services don't use environment variables yet, you may need to update them.

### 5.1 Check Environment Files

Verify `frontend/src/environments/environment.prod.ts` exists and uses the API URL:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-backend-url.onrender.com/api'
};
```

### 5.2 Update Services (if needed)

Ensure all service files use `environment.apiUrl` instead of hardcoded URLs.

---

## Step 6: Final Verification

### 6.1 Test Backend

1. Visit: `https://your-backend.onrender.com/health`
   - Should return: `{"status":"OK","message":"School Management System API"}`

2. Test API endpoint:
   - `https://your-backend.onrender.com/api/auth/login`
   - Should return API response (not 404)

### 6.2 Test Frontend

1. Visit your Vercel URL
2. Try logging in with admin credentials
3. Verify all features work:
   - Login/Logout
   - Dashboard loads
   - API calls succeed

### 6.3 Check CORS (if needed)

If frontend can't connect to backend:
1. Go to Render backend service
2. Check backend code allows your Vercel domain in CORS
3. Update CORS settings if needed

---

## ✅ Deployment Complete!

Your School Management System is now live:
- **Frontend**: `https://your-project.vercel.app`
- **Backend**: `https://your-backend.onrender.com`
- **Database**: Running on Render (internal)

---

## 🔧 Troubleshooting

### Backend Issues

**❌ Backend won't start**
- ✅ Check all environment variables are set correctly
- ✅ Verify `JWT_SECRET` is set (64 characters)
- ✅ Check database credentials match Internal Database URL
- ✅ Review Render logs for errors

**❌ Database connection failed**
- ✅ Use **Internal Database URL** (not External)
- ✅ Verify `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` are correct
- ✅ Check database is running (status: Available)
- ✅ Ensure database and backend are in same region

**❌ Build failed**
- ✅ Check `package.json` has all dependencies
- ✅ Verify TypeScript compiles without errors
- ✅ Check Render build logs for specific errors

### Frontend Issues

**❌ Frontend can't connect to backend**
- ✅ Verify `API_URL` in Vercel matches your backend URL
- ✅ Check backend URL includes `/api` at the end
- ✅ Test backend health endpoint directly
- ✅ Check CORS settings in backend

**❌ Build failed**
- ✅ Check Angular version compatibility
- ✅ Verify all dependencies are in `package.json`
- ✅ Check Vercel build logs for TypeScript errors
- ✅ Ensure `outputDirectory` is `dist/sms-frontend`

**❌ 404 errors on routes**
- ✅ Verify `vercel.json` has rewrite rules for Angular routing
- ✅ Check `outputDirectory` is correct

### Database Issues

**❌ Tables not created**
- ✅ Run `npm run setup-db` in Render backend Shell
- ✅ Check database connection is working
- ✅ Review setup script logs

**❌ Can't create admin user**
- ✅ Ensure database is initialized first
- ✅ Run `npm run create-admin` in Render backend Shell
- ✅ Check user table exists

---

## 📝 Important Notes

### Security
- ✅ **Never commit** `.env` files to GitHub
- ✅ **JWT_SECRET** must be strong (64 characters minimum)
- ✅ Use different secrets for production vs development
- ✅ Regularly update dependencies

### Performance
- ⚠️ **Free tier limitations**:
  - Render free tier spins down after 15 minutes of inactivity
  - First request after spin-down takes 30-60 seconds
  - Consider paid tier for production
- ✅ Database backups are recommended for production
- ✅ Monitor usage and upgrade if needed

### Updates

**To update backend:**
1. Push changes to GitHub
2. Render automatically redeploys
3. Check deployment logs

**To update frontend:**
1. Push changes to GitHub
2. Vercel automatically redeploys
3. Check deployment logs

---

## 🔗 Useful Links

- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Documentation](https://docs.github.com)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 📞 Support

If you encounter issues:
1. Check deployment logs in Render/Vercel
2. Verify all environment variables
3. Test API endpoints directly
4. Check database connectivity
5. Review error messages in browser console

---

## 🎉 Success!

Your School Management System is now deployed and ready to use!

**Next Steps:**
- Share your frontend URL with users
- Create additional admin/teacher accounts
- Configure school settings
- Start adding students and classes
