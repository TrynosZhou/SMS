# Render Database Connection Fix

## Problem
The application was trying to connect using individual `DB_*` environment variables from a database service named `school_db`, but the actual database has different credentials:
- Database: `school_db_primary_loib`
- User: `school_db_primary_loib_user`
- Hostname: `dpg-d5evptur433s7391emu0-a.oregon-postgres.render.com`

## Solution Applied

### 1. Updated `render.yaml`
Changed from individual `DB_*` variables to using `DATABASE_URL` directly:
```yaml
envVars:
  - key: DATABASE_URL
    value: postgresql://school_db_primary_loib_user:PEm5uuEGHSRmm7sxpjjhgCXo5pAJZWjS@dpg-d5evptur433s7391emu0-a.oregon-postgres.render.com:5432/school_db_primary_loib
```

### 2. Updated Local `.env` File
Added the correct `DATABASE_URL` for local development/testing.

## Next Steps

1. **Commit and push the updated `render.yaml`:**
   ```bash
   git add backend/render.yaml
   git commit -m "Fix database connection: Use DATABASE_URL instead of individual DB variables"
   git push
   ```

2. **Redeploy on Render:**
   - Render will automatically detect the changes and redeploy
   - Or manually trigger a redeploy from the Render dashboard

3. **Verify the connection:**
   - Check the logs after deployment
   - You should see: `[DB Config] Using DATABASE_URL connection string`
   - The connection should succeed without authentication errors

## Important Notes

- The `databases` section in `render.yaml` is for provisioning new databases
- Since your database already exists, that section won't affect the connection
- The `DATABASE_URL` in `render.yaml` will override any other database settings
- For security, consider rotating the database password after confirming the connection works

## If Issues Persist

1. Check Render dashboard → Your Web Service → Environment tab
2. Verify that `DATABASE_URL` is set correctly
3. Check the database service is running and accessible
4. Review the application logs for any connection errors

