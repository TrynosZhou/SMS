# 🚀 Render Deployment Implementation Checklist

## ✅ Step-by-Step Implementation Guide

### Part 1: Update Backend Service Root Directory

#### Step 1: Access Render Dashboard
1. Open browser and go to: **https://dashboard.render.com**
2. Sign in to your account

#### Step 2: Locate Your Backend Service
1. Look at the left sidebar - click **"Services"**
2. Find your backend service (might be named):
   - `sms-backend`
   - `SMS`
   - Or check all services to find the web service

**If you don't see any service:**
- Skip to Part 2 (Create New Service)

#### Step 3: Update Root Directory
1. **Click on your backend service** to open it
2. Click the **"Settings"** tab (top menu)
3. Scroll down to **"Build & Deploy"** section
4. Find the **"Root Directory"** field
5. **Current value might be:** (empty) or `/` or `src`
6. **Change it to:** `backend` (type exactly: backend)
7. Click **"Save Changes"** button at the bottom

#### Step 4: Verify Environment Variables
Still in Settings, scroll to **"Environment Variables"** section.

**Add or verify these variables exist:**

| Variable Name | Value | Notes |
|--------------|-------|-------|
| `PORT` | `10000` | Required |
| `NODE_ENV` | `production` | Required |
| `DB_HOST` | `[from database]` | See Part 3 |
| `DB_PORT` | `5432` | Required |
| `DB_USERNAME` | `[from database]` | See Part 3 |
| `DB_PASSWORD` | `[from database]` | See Part 3 |
| `DB_NAME` | `sms_db` | Required |
| `JWT_SECRET` | `919ed24fd554c25ded98bd907994cb88a5b1e8065b52df6c4b981a16423b6aef` | Use the generated one below |
| `JWT_EXPIRES_IN` | `7d` | Required |

**Generated JWT_SECRET (copy this):**
```
919ed24fd554c25ded98bd907994cb88a5b1e8065b52df6c4b981a16423b6aef
```

**To add a variable:**
1. Click **"Add Environment Variable"**
2. Enter the **Key** (variable name)
3. Enter the **Value**
4. Click **"Save Changes"**

#### Step 5: Trigger Deployment
1. Go to **"Deploys"** tab
2. Click **"Manual Deploy"** button
3. Select **"Deploy latest commit"**
4. Watch the logs - it should now find `package.json` in the backend folder!

---

### Part 2: Create Database (If Not Exists)

#### Step 1: Check if Database Exists
1. In Render dashboard, look for **"Databases"** in sidebar
2. Check if `sms-database` exists

**If database exists:** Skip to Part 3

**If no database:** Continue below

#### Step 2: Create PostgreSQL Database
1. Click **"New +"** button (top right)
2. Select **"PostgreSQL"**
3. Fill in the form:
   - **Name**: `sms-database`
   - **Database**: `sms_db`
   - **User**: `sms_user` (or leave default)
   - **Region**: Choose closest (e.g., `Oregon (US West)`)
   - **PostgreSQL Version**: Latest stable
   - **Plan**: Free (or Starter for production)
4. Click **"Create Database"**
5. Wait 2-3 minutes for provisioning

#### Step 3: Get Database Credentials
1. Click on your database (`sms-database`)
2. Go to **"Connections"** tab
3. Find **"Internal Database URL"** (use this one, not External)
4. The URL format is:
   ```
   postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
   ```
5. **Extract the values:**
   - Example URL: `postgresql://sms_user:abc123@dpg-xxxxx-a.oregon-postgres.render.com:5432/sms_db`
   - `DB_HOST` = `dpg-xxxxx-a.oregon-postgres.render.com`
   - `DB_PORT` = `5432`
   - `DB_USERNAME` = `sms_user`
   - `DB_PASSWORD` = `abc123`
   - `DB_NAME` = `sms_db`

6. **Copy these values** - you'll need them for backend environment variables

---

### Part 3: Create Backend Service (If Not Exists)

**Only do this if you couldn't find an existing service in Part 1**

#### Step 1: Create New Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect GitHub account (if not connected)
3. Select repository: `TrynosZhou/SMS`
4. Click **"Connect"**

#### Step 2: Configure Service
Fill in these settings:

**Basic Settings:**
- **Name**: `sms-backend`
- **Environment**: `Node`
- **Region**: Same as database
- **Branch**: `master`
- **Root Directory**: `backend` ⚠️ **CRITICAL!**
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

#### Step 3: Add Environment Variables
Before clicking "Create Web Service", add all environment variables from the table in Part 1, Step 4.

#### Step 4: Create Service
1. Review all settings
2. Click **"Create Web Service"**
3. Render will start deploying automatically

---

### Part 4: Initialize Database

After backend is deployed successfully:

#### Step 1: Open Shell
1. Go to your backend service
2. Click **"Shell"** tab
3. A terminal will open

#### Step 2: Setup Database
Run these commands in the shell:

```bash
npm run setup-db
```

Wait for completion - this creates all tables.

#### Step 3: Create Admin User
Run:

```bash
npm run create-admin
```

Follow the prompts to create your admin account.

---

## ✅ Verification

After deployment completes:

1. **Check Service Status:**
   - Should show "Live" status
   - URL will be: `https://sms-backend.onrender.com`

2. **Test Health Endpoint:**
   - Visit: `https://sms-backend.onrender.com/health`
   - Should return: `{"status":"OK","message":"School Management System API"}`

3. **Check Logs:**
   - Go to "Logs" tab
   - Should see: "Server running on port 10000"
   - No errors about missing package.json

---

## 🆘 Troubleshooting

**Still seeing "Couldn't find package.json"?**
- Double-check Root Directory is exactly `backend` (lowercase)
- Make sure you clicked "Save Changes"
- Try manual deploy again

**Service won't start?**
- Check JWT_SECRET is set (required!)
- Verify all database credentials are correct
- Check logs for specific error messages

**Database connection failed?**
- Use Internal Database URL (not External)
- Verify all DB_* environment variables are set
- Check database is running (status: Available)

---

## 📋 Quick Reference

**JWT_SECRET to use:**
```
919ed24fd554c25ded98bd907994cb88a5b1e8065b52df6c4b981a16423b6aef
```

**Required Environment Variables:**
- PORT=10000
- NODE_ENV=production
- DB_HOST=[from database]
- DB_PORT=5432
- DB_USERNAME=[from database]
- DB_PASSWORD=[from database]
- DB_NAME=sms_db
- JWT_SECRET=[use generated one above]
- JWT_EXPIRES_IN=7d

**Root Directory:** `backend` (must be set!)

---

## 🎯 Next Steps After Deployment

1. ✅ Backend is deployed and running
2. ✅ Database is initialized
3. ✅ Admin user is created
4. ⏭️ Deploy frontend to Vercel (see QUICK_DEPLOY.md)

