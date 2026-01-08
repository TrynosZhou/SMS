# How to Check for Deployment Issues

This guide helps you verify if your production deployment has the latest changes or if there are caching issues.

## 1. Check for Old Build (Not Updated)

### Method A: Check Build Timestamp in Browser

1. **Open your production site** (e.g., `https://your-site.onrender.com`)

2. **Open Browser Developer Tools**:
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Press `Cmd+Option+I` (Mac)

3. **Go to Network Tab**:
   - Refresh the page (`F5` or `Ctrl+R`)
   - Look for `main.*.js` or `main.*.js` files
   - Click on one of these files
   - Check the **Response Headers**:
     - Look for `Last-Modified` or `Date` header
     - This shows when the file was built

4. **Compare with Your Latest Commit**:
   - Check your Git commit history
   - If the build date is older than your latest commit, the build is outdated

### Method B: Check Build Logs on Deployment Platform

#### For Render.com:
1. Go to [Render.com Dashboard](https://dashboard.render.com)
2. Click on your **Frontend Service**
3. Go to **Logs** tab
4. Look at the **most recent deployment**:
   - Check the deployment timestamp
   - Look for build completion messages
   - Verify it shows "Build successful"

5. **Check Build Command**:
   - Go to **Settings** → **Build & Deploy**
   - Verify Build Command is: 
     ```
     rm -rf dist node_modules/.cache .angular && npm ci && npm run build:clean
     ```

#### For Vercel:
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your **Project**
3. Go to **Deployments** tab
4. Check the **latest deployment**:
   - Look at the timestamp
   - Check if it shows "Ready" status
   - Click on it to see build logs

### Method C: Check File Hashes

1. **In Browser Developer Tools**:
   - Go to **Network** tab
   - Refresh page
   - Find `main.*.js` file
   - Note the hash in filename (e.g., `main.a15339b8c4cc7e9b.js`)

2. **Build Locally and Compare**:
   ```bash
   cd frontend
   npm run build:clean
   ls -la dist/sms-frontend/*.js
   ```
   - Compare the hash in the filename
   - If hashes are different, production has old build

### Method D: Add Version Check in Code

Add this to your `app.component.ts` to display build version:

```typescript
export class AppComponent implements OnInit {
  buildVersion = '1.0.1'; // Update this with each deployment
  
  ngOnInit() {
    console.log('Build Version:', this.buildVersion);
    console.log('Build Date:', new Date().toISOString());
  }
}
```

Then check browser console to see the version.

---

## 2. Check for Browser Caching

### Method A: Hard Refresh

1. **Windows/Linux**:
   - Press `Ctrl + Shift + R` or `Ctrl + F5`
   - This forces browser to reload all files

2. **Mac**:
   - Press `Cmd + Shift + R`

3. **Check if changes appear**:
   - If changes appear after hard refresh, it was browser cache
   - If not, it's likely a build issue

### Method B: Clear Browser Cache

1. **Chrome/Edge**:
   - Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
   - Select "Cached images and files"
   - Choose "All time"
   - Click "Clear data"
   - Refresh page

2. **Firefox**:
   - Press `Ctrl + Shift + Delete`
   - Select "Cache"
   - Choose "Everything"
   - Click "Clear Now"

3. **Safari**:
   - Press `Cmd + Option + E` to clear cache
   - Or: Safari → Preferences → Advanced → Show Develop menu
   - Then: Develop → Empty Caches

### Method C: Use Incognito/Private Mode

1. Open browser in **Incognito/Private mode**:
   - Chrome: `Ctrl + Shift + N` (Windows) or `Cmd + Shift + N` (Mac)
   - Firefox: `Ctrl + Shift + P` (Windows) or `Cmd + Shift + P` (Mac)
   - Edge: `Ctrl + Shift + N`

2. Visit your production site
3. Check if changes appear
4. If yes → it was browser cache
5. If no → it's a build/deployment issue

### Method D: Check Network Tab for Cached Files

1. Open **Developer Tools** → **Network** tab
2. Check **"Disable cache"** checkbox (at top)
3. Refresh page
4. Look at file status:
   - **200 (from disk cache)** = Browser cached it
   - **200 (from memory cache)** = Browser cached it
   - **304 Not Modified** = Server says file hasn't changed
   - **200** = Fresh file loaded

---

## 3. Check for Different Version Deployed

### Method A: Compare File Contents

1. **Check a specific file in production**:
   - Open browser DevTools → **Sources** tab
   - Navigate to the file (e.g., `report-card.component.html`)
   - Check if it contains the latest changes

2. **Compare with local code**:
   ```bash
   # In your local project
   cat frontend/src/app/components/exams/report-card/report-card.component.html
   ```
   - Compare the content
   - If different, wrong version is deployed

### Method B: Check Git Commit in Production

1. **Add version info to your app**:
   Create `frontend/src/environments/version.ts`:
   ```typescript
   export const APP_VERSION = '1.0.1';
   export const BUILD_DATE = new Date().toISOString();
   ```

2. **Display it in your app** (temporarily):
   Add to `app.component.html`:
   ```html
   <div style="position: fixed; bottom: 0; right: 0; background: #000; color: #fff; padding: 5px; font-size: 10px;">
     Version: {{ version }} | Built: {{ buildDate }}
   </div>
   ```

3. **Update version with each deployment**:
   - Change version number
   - Deploy
   - Check if production shows new version

### Method C: Check Deployment Platform Logs

#### Render.com:
1. Go to **Dashboard** → Your Service → **Events**
2. Check **latest deployment**:
   - Look at commit hash
   - Compare with your latest Git commit
   - If different, wrong commit was deployed

#### Vercel:
1. Go to **Dashboard** → Your Project → **Deployments**
2. Check **latest deployment**:
   - Look at commit hash
   - Check "Source" to see which branch/commit
   - Verify it matches your latest commit

### Method D: Check Environment Variables

1. **Check API URL in production**:
   - Open browser console
   - Type: `localStorage.getItem('token')` (if you store API URL)
   - Or check Network tab for API calls
   - Verify it's pointing to correct backend

2. **Compare with environment files**:
   ```bash
   # Check production environment
   cat frontend/src/environments/environment.prod.ts
   
   # Should match your production backend URL
   ```

---

## Quick Diagnostic Checklist

Run through this checklist to identify the issue:

- [ ] **Hard refresh** (Ctrl+Shift+R) - Did changes appear?
  - ✅ Yes → Browser cache issue (solved)
  - ❌ No → Continue

- [ ] **Incognito mode** - Did changes appear?
  - ✅ Yes → Browser cache issue (solved)
  - ❌ No → Continue

- [ ] **Check build logs** - Is latest commit deployed?
  - ❌ No → Trigger new deployment
  - ✅ Yes → Continue

- [ ] **Check file hashes** - Do they match local build?
  - ❌ No → Old build deployed (trigger rebuild)
  - ✅ Yes → Continue

- [ ] **Check file contents** - Does production code match local?
  - ❌ No → Wrong version deployed
  - ✅ Yes → Issue might be elsewhere

---

## How to Force a Fresh Deployment

### For Render.com:

1. **Clear Build Cache**:
   - Dashboard → Your Service → **Settings**
   - Scroll to **Build & Deploy**
   - Click **"Clear Build Cache"**
   - Save

2. **Trigger Manual Deployment**:
   - Go to **Manual Deploy** section
   - Click **"Deploy latest commit"**
   - Or push a new commit to trigger auto-deploy

3. **Verify Build Command**:
   - Settings → Build Command should be:
     ```
     rm -rf dist node_modules/.cache .angular && npm ci && npm run build:clean
     ```

### For Vercel:

1. **Clear Build Cache**:
   - Dashboard → Project → **Settings** → **General**
   - Scroll to **Build & Development Settings**
   - Click **"Clear Build Cache"**

2. **Redeploy**:
   - Go to **Deployments** tab
   - Click **"..."** on latest deployment
   - Select **"Redeploy"**

### Manual Clean Build:

```bash
# Navigate to frontend directory
cd frontend

# Remove all build artifacts and cache
rm -rf dist node_modules/.cache .angular

# Clean install dependencies
npm ci

# Build with clean cache
npm run build:clean

# Verify build output
ls -la dist/sms-frontend/
```

---

## Prevention Tips

1. **Always use clean build commands** in deployment:
   ```
   rm -rf dist node_modules/.cache .angular && npm ci && npm run build:clean
   ```

2. **Enable output hashing** in `angular.json`:
   ```json
   "outputHashing": "all"
   ```
   This creates unique filenames for each build.

3. **Add cache headers** in your server:
   - No-cache for `index.html`
   - Long-term cache for hashed assets

4. **Version your builds**:
   - Add version number to your app
   - Display it in console or footer (dev mode)

5. **Monitor deployments**:
   - Check deployment logs after each deploy
   - Verify build timestamp matches your commit time

---

## Common Issues and Solutions

### Issue: "Changes not appearing after deployment"

**Solution**:
1. Clear build cache on deployment platform
2. Hard refresh browser (Ctrl+Shift+R)
3. Check if build completed successfully
4. Verify correct branch/commit was deployed

### Issue: "Old JavaScript files loading"

**Solution**:
1. Check file hashes in Network tab
2. Verify `outputHashing: "all"` in `angular.json`
3. Clear browser cache completely
4. Check CDN cache (if using CDN)

### Issue: "404 errors on routes"

**Solution**:
1. Verify `server.js` is serving `index.html` for all routes
2. Check deployment platform routing configuration
3. Ensure SPA fallback is configured

### Issue: "API calls failing"

**Solution**:
1. Check `environment.prod.ts` has correct API URL
2. Verify backend is running and accessible
3. Check CORS settings on backend
4. Verify environment variables are set correctly













