# Fix Database Connection Issue

## Problem
The database hostname `dpg-d4bhs42dbo4c738qs4t0-a` is incomplete and missing the domain suffix, causing DNS resolution to fail.

## Solution

### Option 1: Quick Fix Using the Helper Script (Recommended)

1. **Get your database password from Render:**
   - Go to https://dashboard.render.com
   - Click on your PostgreSQL database (named `school_db`)
   - Go to the "Connections" tab
   - Copy either:
     - The full "Internal Database URL" (recommended), OR
     - Just the password

2. **Run the helper script:**
   ```powershell
   cd backend
   node scripts/update-render-db-config.js YOUR_PASSWORD_HERE
   ```
   
   Or if you have the full DATABASE_URL:
   ```powershell
   node scripts/update-render-db-config.js postgresql://user:pass@host:port/db
   ```

3. **Restart your server**

### Option 2: Manual Fix

1. **Get your database connection details from Render:**
   - Go to https://dashboard.render.com
   - Click on your PostgreSQL database (`school_db`)
   - Go to "Connections" tab
   - Copy the "Internal Database URL"

2. **Update your `.env` file:**
   
   Uncomment and update this line in `backend/.env`:
   ```env
   DATABASE_URL=postgresql://school_db_primary_user:YOUR_PASSWORD@dpg-d4bhs42dbo4c738qs4t0-a.oregon-postgres.render.com:5432/sms_db
   ```
   
   Replace `YOUR_PASSWORD` with the actual password from Render.

3. **Restart your server**

### Option 3: If Running on Render (Production)

If your app is deployed on Render and still getting this error, check:

1. **Verify the database service exists:**
   - The `render.yaml` references a database named `school_db`
   - Make sure this database exists in your Render account

2. **Check Render environment variables:**
   - In Render dashboard → Your Web Service → Environment
   - Verify that `DB_HOST` is being set correctly by Render
   - If it's incomplete, you may need to manually set it

3. **Manual override in Render:**
   - Go to your Web Service in Render
   - Environment tab
   - Add or update:
     - `DB_HOST=dpg-d4bhs42dbo4c738qs4t0-a.oregon-postgres.render.com`
     - (Get the exact hostname from your database's Connections tab)

## Expected Hostname Format

The hostname should look like:
```
dpg-d4bhs42dbo4c738qs4t0-a.oregon-postgres.render.com
```

NOT:
```
dpg-d4bhs42dbo4c738qs4t0-a  ❌ (incomplete)
```

## Verification

After updating, restart your server and check the logs. You should see:
```
[DB Config] Using DATABASE_URL connection string
[DB Config] Database connection settings:
[DB Config]   DB_HOST: dpg-d4bhs42dbo4c738qs4t0-a.oregon-postgres.render.com
```

If you still see the incomplete hostname, the environment variable might be set elsewhere (system environment, Render dashboard, etc.).

## Need Help?

If you're still having issues:
1. Check that your database is running in Render
2. Verify the database name matches `school_db` in render.yaml
3. Make sure you're using the "Internal Database URL" (not External) for connections from Render services

