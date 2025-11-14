# Render.com Setup Guide - Step by Step

## 🎯 Quick Fix: Update Root Directory

### Step 1: Access Your Render Dashboard
1. Go to: https://dashboard.render.com
2. Sign in to your account

### Step 2: Find Your Backend Service
1. In the left sidebar, click **"Services"** or look for your service
2. Look for a service named:
   - `sms-backend`
   - `SMS`
   - Or any service related to your backend
3. If you see multiple services, check which one is a "Web Service" (not Database)

### Step 3: Update Root Directory Setting
1. Click on your backend service to open it
2. Click on the **"Settings"** tab (top navigation)
3. Scroll down to find **"Build & Deploy"** section
4. Look for **"Root Directory"** field
5. **Change it to:** `backend` (type exactly: backend, no quotes, no spaces)
6. Click **"Save Changes"** button

### Step 4: Verify Environment Variables
While in Settings, check that these environment variables are set:

**Required Variables:**
- `PORT` = `10000`
- `NODE_ENV` = `production`
- `DB_HOST` = (your database host from Internal Database URL)
- `DB_PORT` = `5432`
- `DB_USERNAME` = (your database username)
- `DB_PASSWORD` = (your database password)
- `DB_NAME` = `sms_db`
- `JWT_SECRET` = (64 character random string)
- `JWT_EXPIRES_IN` = `7d`

**To get database credentials:**
1. Go to your PostgreSQL database service in Render
2. Click on it
3. Go to **"Connections"** tab
4. Copy the **Internal Database URL**
5. Extract credentials from the URL format:
   ```
   postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
   ```

### Step 5: Trigger Deployment
1. Go to the **"Deploys"** tab
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Or wait for automatic deployment (if auto-deploy is enabled)

### Step 6: Monitor Deployment
1. Watch the **"Logs"** tab for build progress
2. You should see:
   - `npm install` running
   - `npm run build` compiling TypeScript
   - `npm start` starting the server
3. If successful, you'll see: "Your service is live at https://..."

---

## 🗄️ Database Setup (If Not Already Created)

### Create PostgreSQL Database

1. In Render dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `sms-database`
   - **Database**: `sms_db`
   - **User**: Leave default or set to `sms_user`
   - **Region**: Choose closest to you (e.g., Oregon)
   - **Plan**: Free (or Starter for production)
3. Click **"Create Database"**
4. Wait 2-3 minutes for provisioning
5. Copy the **Internal Database URL** for environment variables

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Root Directory is set to `backend`
- [ ] All environment variables are configured
- [ ] Database is running and accessible
- [ ] Build completes successfully (check logs)
- [ ] Service shows "Live" status
- [ ] Test endpoint: `https://your-service.onrender.com/health`

---

## 🔧 Troubleshooting

**If you still see "Couldn't find package.json":**
- Double-check Root Directory is exactly `backend` (lowercase, no quotes)
- Verify the setting was saved
- Check that `backend/package.json` exists in your GitHub repo

**If build fails:**
- Check the Logs tab for specific error messages
- Verify all environment variables are set
- Ensure database credentials are correct

**If service won't start:**
- Check that `JWT_SECRET` is set (required)
- Verify database connection string is correct
- Check that PORT is set to 10000

---

## 📞 Need Help?

If you can't find your service:
1. Check all services in your Render dashboard
2. Look for any service with "SMS" or "backend" in the name
3. If none exists, create a new one using the guide above

