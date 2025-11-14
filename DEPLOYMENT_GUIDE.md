# Deployment Guide: SMS to GitHub, Render, and Vercel

This guide will help you deploy the School Management System:
- **Backend & Database**: Render.com
- **Frontend**: Vercel.com
- **Source Code**: GitHub

---

## Prerequisites

1. GitHub account
2. Render.com account
3. Vercel.com account
4. Git installed on your local machine

---

## Step 1: Push Project to GitHub

### 1.1 Initialize Git Repository (if not already done)

```bash
cd C:\Users\DELL\Desktop\SMS
git init
```

### 1.2 Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it: `school-management-system` (or your preferred name)
3. **Do NOT** initialize with README, .gitignore, or license
4. Copy the repository URL (e.g., `https://github.com/yourusername/school-management-system.git`)

### 1.3 Add Files and Push

```bash
# Add all files
git add .

# Commit
git commit -m "Initial commit: School Management System"

# Add remote repository
git remote add origin https://github.com/yourusername/school-management-system.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Database on Render.com

### 2.1 Create PostgreSQL Database

1. Log in to [Render.com](https://render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `sms-database` (or your preferred name)
   - **Database**: `sms_db`
   - **User**: `sms_user` (or leave default)
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: Latest stable
   - **Plan**: Free tier (or paid if needed)

4. Click **"Create Database"**
5. Wait for database to be provisioned (2-3 minutes)

### 2.2 Get Database Connection Details

1. Once created, click on your database
2. Go to **"Connections"** tab
3. Copy the following:
   - **Internal Database URL** (for Render services)
   - **External Database URL** (for local development)
   - Note: The URL format is: `postgresql://user:password@host:port/database`

---

## Step 3: Deploy Backend on Render.com

### 3.1 Create Web Service

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Select your repository: `school-management-system`

### 3.2 Configure Backend Service

**Basic Settings:**
- **Name**: `sms-backend`
- **Environment**: `Node`
- **Region**: Same as database
- **Branch**: `main`
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Environment Variables:**
Add these in the **"Environment"** section:

```
PORT=10000
DB_HOST=<from-database-internal-host>
DB_PORT=5432
DB_USERNAME=<from-database-username>
DB_PASSWORD=<from-database-password>
DB_NAME=<from-database-name>
JWT_SECRET=<REQUIRED: generate-a-strong-secret-min-32-characters>
JWT_EXPIRES_IN=7d
NODE_ENV=production
```

**⚠️ IMPORTANT: JWT_SECRET is REQUIRED**
- The server will NOT start without JWT_SECRET
- Must be at least 32 characters long
- Use a strong, random secret (never use default values)
- Generate using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**To get database credentials:**
- Go to your PostgreSQL database on Render
- Use the **Internal Database URL** and extract:
  - `DB_HOST`: hostname from URL
  - `DB_PORT`: 5432
  - `DB_USERNAME`: username from URL
  - `DB_PASSWORD`: password from URL
  - `DB_NAME`: database name from URL

**Generate JWT_SECRET:**
```bash
# Run this in terminal to generate a secure secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repo
   - Install dependencies
   - Build the TypeScript code
   - Start the server
3. Wait for deployment (5-10 minutes)
4. Once deployed, you'll get a URL like: `https://sms-backend.onrender.com`

### 3.4 Verify Backend

1. Visit: `https://your-backend-url.onrender.com/health`
2. Should return: `{"status":"OK","message":"School Management System API"}`

---

## Step 4: Deploy Frontend on Vercel.com

### 4.1 Prepare Frontend Configuration

The frontend needs to know the backend URL. We'll configure this during deployment.

### 4.2 Deploy to Vercel

1. Log in to [Vercel.com](https://vercel.com)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository: `school-management-system`
4. Configure:
   - **Framework Preset**: Angular
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Output Directory**: `dist/sms-frontend` (check your angular.json)
   - **Install Command**: `npm install`

### 4.3 Add Environment Variables

In Vercel project settings → **Environment Variables**, add:

```
API_URL=https://your-backend-url.onrender.com/api
```

Replace `your-backend-url.onrender.com` with your actual Render backend URL.

### 4.4 Update Frontend Service

We need to update the frontend service to use the environment variable. The service currently hardcodes `http://localhost:3001/api`.

**Note**: After deployment, we'll need to update the `auth.service.ts` and `exam.service.ts` to use the environment variable.

### 4.5 Deploy

1. Click **"Deploy"**
2. Vercel will build and deploy your frontend
3. You'll get a URL like: `https://school-management-system.vercel.app`

---

## Step 5: Update Frontend to Use Environment Variables

We need to update the frontend services to use the API URL from environment variables.

### 5.1 Create Environment Files

Create `frontend/src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api'
};
```

Create `frontend/src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: process.env['API_URL'] || 'https://your-backend-url.onrender.com/api'
};
```

### 5.2 Update Services

Update all service files to use `environment.apiUrl` instead of hardcoded URLs.

---

## Step 6: Initialize Database

After backend is deployed, you need to initialize the database:

1. Go to your Render backend service
2. Click **"Shell"** tab
3. Run:
```bash
npm run setup-db
```

Or use the Render console to run database setup scripts.

---

## Step 7: Create Admin User

1. In Render backend shell, run:
```bash
npm run create-admin
```

Follow prompts to create your first admin user.

---

## Troubleshooting

### Backend Issues

1. **Database Connection Failed**
   - Verify database credentials in environment variables
   - Ensure database is running on Render
   - Check if using Internal Database URL (not External)

2. **Build Failed**
   - Check build logs in Render
   - Ensure all dependencies are in `package.json`
   - Verify TypeScript compilation

3. **Server Crashes**
   - Check logs in Render dashboard
   - Verify PORT environment variable
   - Check database connection

### Frontend Issues

1. **API Calls Fail**
   - Verify `API_URL` environment variable in Vercel
   - Check CORS settings in backend
   - Ensure backend URL is correct

2. **Build Failed**
   - Check build logs in Vercel
   - Verify Angular version compatibility
   - Check for TypeScript errors

---

## Security Notes

1. **Never commit `.env` files** to GitHub
2. **Use strong JWT_SECRET** (minimum 32 characters)
3. **Enable HTTPS** (Render and Vercel provide this automatically)
4. **Review CORS settings** in backend
5. **Regularly update dependencies**

---

## Updating Deployments

### Backend Updates
1. Push changes to GitHub
2. Render will automatically redeploy
3. Check deployment logs

### Frontend Updates
1. Push changes to GitHub
2. Vercel will automatically redeploy
3. Check deployment logs

---

## Useful Links

- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Documentation](https://docs.github.com)

---

## Support

If you encounter issues:
1. Check deployment logs
2. Verify environment variables
3. Test API endpoints directly
4. Check database connectivity

