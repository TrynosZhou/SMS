# Fixing Database Connection Issues

## Problem
The system cannot connect to the Render database because the hostname cannot be resolved (ENOTFOUND error).

## Quick Fix: Use Local Database

If you have PostgreSQL installed locally, you can quickly switch to use it:

1. **Comment out the DATABASE_URL** in `backend/.env`:
   ```env
   # DATABASE_URL=postgresql://school_db_primary_loib_user:PEm5uuEGHSRmm7sxpjjhgCXo5pAJZWjS@dpg-d5evptur433s7391emu0-a.oregon-postgres.render.com:5432/school_db_primary_loib
   ```

2. **Uncomment and use local database settings** (already configured):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=admin
   DB_NAME=sms_db
   DB_SYNC=true
   ```

3. **Make sure PostgreSQL is running locally**:
   - Windows: Check Services or start PostgreSQL service
   - Create database if needed: `CREATE DATABASE sms_db;`

4. **Restart the backend server**

## Fix Render Database Connection

### Option 1: Wake Up the Database (Most Common Issue)

Render free tier databases pause after inactivity. To wake it up:

1. Go to https://dashboard.render.com
2. Log in to your account
3. Find your PostgreSQL database service
4. Click on it to open details
5. If it shows "Paused", click **"Resume"** button
6. Wait 30-60 seconds for it to start
7. Copy the **Internal Database URL** from the dashboard
8. Update `DATABASE_URL` in your `.env` file

### Option 2: Verify Hostname

1. In Render dashboard, go to your database
2. Click on "Connect" or "Info" tab
3. Copy the **Internal Database URL** (not External)
4. The format should be:
   ```
   postgresql://username:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/database_name
   ```
5. Update `DATABASE_URL` in your `.env` file with the correct URL

### Option 3: Check Database Status

1. In Render dashboard, check if:
   - Database is running (not paused)
   - Database hasn't been deleted
   - You're using the correct database instance

### Option 4: Test Connection

Run the diagnostic script:
```bash
cd backend
node scripts/test-db-connection.js
```

This will test:
- DNS resolution
- Network connectivity
- Connection to the database

## Common Issues

### Issue: Database is Paused
**Solution**: Resume it from Render dashboard

### Issue: Hostname Changed
**Solution**: Get the new Internal Database URL from Render dashboard

### Issue: Database Deleted
**Solution**: Create a new database in Render or use local database

### Issue: Network/Firewall
**Solution**: 
- Check your internet connection
- Verify firewall isn't blocking port 5432
- Try using External Database URL (if available) instead of Internal

## Recommended Setup

For development, use **local database**:
- Faster
- No internet dependency
- Free
- No pause issues

For production, use **Render database**:
- Managed service
- Automatic backups
- Scalable

## Testing the Fix

After making changes:

1. Restart the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Look for these success messages:
   ```
   [DB Config] ✅ Using DATABASE_URL connection string
   [Server] ✅ Database connected successfully
   ```

3. If you see errors, check:
   - Database is running
   - Credentials are correct
   - Network connectivity
