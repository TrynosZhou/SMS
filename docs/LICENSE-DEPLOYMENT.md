# License tier system — production deployment (Render + Vercel)

Safe rollout for an existing deployment: **additive DB only**, **no global route gating**, **Platinum for all schools**, **fail-open UI**.

## Deployment order

1. **Database (Render PostgreSQL)** — run license migrations only.
2. **Backend (Render)** — deploy API with license code; routes stay ungated until you add `requireFeature()` per route.
3. **Frontend (Vercel)** — deploy Angular app last.

Do not deploy frontend before backend if you rely on `GET /api/license/me` (the UI fails open anyway, but admin license config needs the API).

---

## Step 1 — Database

From your machine (or Render shell) with production `DATABASE_URL` / DB_* env vars:

```bash
cd backend
npm run build   # if migrations run from dist in your setup
npx ts-node scripts/run-license-migration.ts
```

This runs two **non-destructive** migrations:

| Migration | What it does |
|-----------|----------------|
| `CreateLicenseSystem1778000000000` | `CREATE TABLE IF NOT EXISTS` for `schools`, `features`, `license_tiers`, `tier_features`, `licenses`, `license_feature_audit_log` — **no ALTER/DROP on existing tables** |
| `AssignPlatinumLicenseRollout1778000000001` | Seeds feature keys, assigns **Platinum** to every school (new + existing licenses upgraded), grants all active features to Platinum |

Verify:

```sql
SELECT s.name, t."tierName" FROM licenses l
JOIN schools s ON s.id = l."schoolId"
JOIN license_tiers t ON t.id = l."tierId"
WHERE l."isActive" = true;
```

---

## Step 2 — Backend (Render)

Deploy the backend service as usual. Ensure existing variables remain set.

### Render environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `DB_HOST` | Yes* | Or use `DATABASE_URL` if your app supports it |
| `DB_PORT` | Yes* | |
| `DB_USERNAME` | Yes* | |
| `DB_PASSWORD` | Yes* | |
| `DB_NAME` | Yes* | |
| `JWT_SECRET` | Yes | Min 32 characters |
| `JWT_EXPIRES_IN` | No | Default `1d` |
| `FRONTEND_URL` | Yes | Vercel URL for CORS (e.g. `https://your-app.vercel.app`) |
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Render sets this |
| `DB_SYNC` | Yes | **`false`** in production |
| `DEFAULT_SCHOOL_ID` | No | UUID of default school; omit to use first active school |

**No new license-specific secrets** are required.

### Protecting routes later (optional)

`requireFeature('feature_key')` is **not** applied to routers by default. Add it only on routes you choose, for example:

```typescript
import { requireFeature } from '../middleware/requireFeature';

router.get('/sensitive', authenticate, requireFeature('fee_management'), handler);
```

Admins/superadmins always bypass checks. On DB errors the middleware **fails open** (allows the request) during rollout.

---

## Step 3 — Frontend (Vercel)

Deploy after backend is live.

### Vercel environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| Production `apiUrl` | Yes | Set in `environment.prod.ts` or via build replacement — must point to Render API, e.g. `https://your-api.onrender.com/api` |

**No new Vercel variables** are required for licensing if `apiUrl` is already correct.

### UI behavior

- `FeatureGate` and `LicenseService.hasFeature()` **fail open**: content stays visible if `/license/me` fails or is still loading.
- After a successful license load, staff roles only see locks when the feature is genuinely not on their tier.
- Configure tiers at `/admin/license-config` (admin/superadmin).

---

## Rollback notes

- **Frontend/backend rollback** — safe; ungated routes behave as before.
- **DB rollback** — only if you must remove license tables; run migration `down` manually (drops license tables only, not core SMS tables).

---

## Checklist

- [ ] Migrations applied on production DB
- [ ] All active schools show `platinum` tier
- [ ] Render: `DB_SYNC=false`, `FRONTEND_URL` matches Vercel
- [ ] Backend deployed and `/api/license/me` returns 200 for a test user
- [ ] Vercel frontend deployed
- [ ] Smoke test: login, settings, invoices, students (no 403 from license)
- [ ] Optionally enable `requireFeature()` on specific routes when ready
