# ✓ Hidden Admin System — Production Deployment Checklist

## Pre-Launch (Development)
- [ ] Run `npm run test:security` in backend — Expect 50/50 tests passing
- [ ] Run `npm run build` in root — Expect 0 errors, dist/ folder created
- [ ] Run `npm run start` in backend — Expect server listening on port 5000, all routes loaded
- [ ] Verify admin panel loads at `http://localhost:3000/ops-bridge-93a1`
- [ ] Verify public users cannot see admin role (not in register, login, dashboard)
- [ ] Verify public `/api/auth/login` rejects admin username with 401 "Invalid credentials"

---

## Database Migration (Before Backend Deploy)

Run these MongoDB commands in production database:

```javascript
// Create unique partial index to enforce exactly one admin
db.users.createIndex(
  { role: 1 },
  { 
    unique: true, 
    partialFilterExpression: { role: 'admin' },
    name: 'admin_unique_index'
  }
);

// Verify index created
db.users.getIndexes();
```

**Expected Result:** Index with name `admin_unique_index` appears in list.

---

## Backend Deployment Steps

### 1. Generate Secure Secrets
```bash
# Generate JWT secret (64-byte hex string)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT Refresh secret (different value)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Set Environment Variables (Platform: Heroku / Railway / Render / Custom)

**CRITICAL VARIABLES (Must Change):**
```
ADMIN_EMAIL = your-production-admin-email@company.com
ADMIN_BOOTSTRAP_PASSWORD = VeryComplexSecurePassword123!@#
ADMIN_PRIVATE_PATH_SEGMENT = GenerateRandomString_oc7x9kL2m (keep secret!)
JWT_SECRET = <from step 1>
JWT_REFRESH_SECRET = <from step 1>
MONGODB_URI = <production MongoDB URI with credentials>
REDIS_URL = <production Redis URL if using>
RAZORPAY_KEY_ID = <production Razorpay key>
RAZORPAY_KEY_SECRET = <production Razorpay secret>
```

**Optional (Recommended for Security):**
```
ADMIN_IP_WHITELIST = 203.0.113.10,198.51.100.20
  (Restrict admin access to office IP addresses only)
```

### 3. Deploy Backend
```bash
git push <remote> main
# Or via platform-specific deploy command (Render, Railway, Heroku, etc.)
```

Monitor deployment logs for:
- ✅ Server boots successfully
- ✅ All routes initialized (including hidden admin routes)
- ✅ Admin session schema created
- ✅ "Listening on port 5000" (or your PORT)
- ❌ If error "Multiple admin documents found", DELETE admin users except one, redeploy

### 4. Verify Backend Admin Creation
```bash
curl https://your-backend.com/api/health
```

Look for `"adminPathHash": "sha256hash..."` in response. This confirms:
- Admin routes are initialized
- Admin path segment is active
- Backend is ready

### 5. Permanently Disable Bootstrap (CRITICAL - After First Boot)
```bash
# In platform secrets/env vars, SET (do NOT delete):
ADMIN_BOOTSTRAP_PASSWORD = ""
```

This prevents accidental admin account re-creation if env vars are accidentally set again.

---

## Frontend Deployment Steps

### 1. Set Environment Variables (Vercel / Netlify / S3+CloudFront)

**Required:**
```
VITE_API_URL = https://your-backend.com/api
VITE_ADMIN_PANEL_PATH = /ops-bridge-abc123def (secret path, keep different on each deployment)
VITE_ADMIN_API_SEGMENT = _ops_console_f91b7c (must match backend)
```

### 2. Build & Deploy
```bash
npm run build
# Vercel: git push (auto-deploys)
# AWS S3: aws s3 cp dist/ s3://bucket-name/ --recursive
# Docker: docker build -t app:v1 .
```

### 3. Verify Frontend Admin Panel
- Navigate to: `https://your-frontend.com/ops-bridge-abc123def`
- You should see admin login form
- Public nav/header/footer NOT visible
- Normal users cannot navigate here (no links in UI)

### 4. Verify Admin is Hidden from Public Routes
- Go to `/register` — Admin role NOT in options ✓
- Go to `/login` — Only 4 roles shown, NOT admin ✓
- Go to `/dashboard` — Admin dashboard NOT in selector ✓

---

## First Admin Account Creation

### If Admin Account Already Exists
```bash
# Backend automatically creates admin on first boot if ADMIN_BOOTSTRAP_PASSWORD set
# To force re-create, delete admin manually:
mongo <MONGODB_URI>
> db.users.deleteOne({ role: 'admin', email: /ajay|admin/ })
# Then restart backend
```

### Verify Admin Account Created
```bash
mongo <MONGODB_URI>
> db.users.find({ role: 'admin' })
```

Expected:
```json
{
  "_id": ObjectId("..."),
  "email": "your-admin-email@company.com",
  "role": "admin",
  "password": "$2b$12$...",  // hashed
  "createdAt": ISODate("2026-01-15T10:00:00Z")
}
```

---

## Post-Launch Verification

### 1. Admin Login Flow
```bash
# Visit: https://your-frontend.com/{VITE_ADMIN_PANEL_PATH}
# 1. Enter email: your-production-admin-email@company.com
# 2. Enter password: (your ADMIN_BOOTSTRAP_PASSWORD)
# 3. Check email for MFA code (6 digits)
# 4. Enter MFA code
# 5. Should redirect to admin control tower dashboard
```

### 2. Verify Hidden Routes Working
```bash
# Get admin token first (after login)
# Then test API:
curl https://your-backend.com/api/{ADMIN_PRIVATE_PATH_SEGMENT}/control/users \
  -H "Authorization: Bearer <admin_token>"

# Expected: 200 OK, list of all users
```

### 3. Verify Kill Switch Works
```bash
curl -X POST https://your-backend.com/api/{ADMIN_PRIVATE_PATH_SEGMENT}/control/kill-switch \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "bookingsPaused": true }'

# Public should now fail with 503:
curl -X POST https://your-backend.com/api/loads/bid \
  -H "Authorization: Bearer <user_token>" \
  -d '...'
# Expected: 503 Service Unavailable (bookings paused)
```

### 4. Verify Public Users Cannot Access Admin
```bash
# Try public login as admin:
curl -X POST https://your-backend.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin-email@company.com", "password": "password" }'

# Expected: 401 Invalid credentials (even with correct password)
```

### 5. Monitor Admin Sessions
```bash
# View admin sessions created:
mongo <MONGODB_URI>
> db.adminsessions.find().pretty()

# Should show: IP address, device ID, login time, session ID, refresh token hash
```

---

## Security Hardening After Launch

### 1. Delete Bootstrap Password (Already Done? Verify)
```bash
# Platform dashboard → Environment Variables
ADMIN_BOOTSTRAP_PASSWORD = ""
# This prevents accidental admin recreation from old credentials
```

### 2. Enable IP Whitelisting
```bash
# Set to your office/infrastructure IPs only:
ADMIN_IP_WHITELIST = 203.0.113.10,198.51.100.20,10.0.0.0/8
# Non-whitelisted IPs get 403 Forbidden
```

### 3. Change Default Admin Path Segment
```bash
# Use something completely random:
ADMIN_PRIVATE_PATH_SEGMENT = x7kL9mQ2pN5rT8vB1cD4eF6gH
# Restart backend after change
```

### 4. Set Up Monitoring & Alerts
- Monitor `AdminSession` collection for unusual login patterns
- Alert on failed MFA attempts (> 5 in 15 minutes)
- Alert on kill switch activation
- Alert on user status changes or account suspensions

---

## Troubleshooting

### Problem: Admin login returns "Invalid credentials"
**Quick Checks:**
1. Verify `ADMIN_EMAIL` in backend matches your credentials
2. Verify `ADMIN_BOOTSTRAP_PASSWORD` in backend is set and correct
3. Check email is receiving MFA code (check spam folder)
4. Verify backend `/health` endpoint returns `adminPathHash` value

### Problem: Admin panel 404
1. Verify frontend URL: `https://your-frontend.com/{VITE_ADMIN_PANEL_PATH}`
2. Verify `VITE_ADMIN_PANEL_PATH` is set in frontend ENV
3. Run `npm run build` and redeploy frontend

### Problem: Admin API returns 403 Forbidden
1. Verify JWT token is valid and not expired
2. Check `ADMIN_IP_WHITELIST` — your IP may be blocked
3. Verify backend received `ADMIN_EMAIL` and role is 'admin'

### Problem: Public users can see admin in register page
1. This should NOT happen — admin role removed from ROLE_CARDS
2. Verify frontend rebuild: `npm run build`
3. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
4. Check browser console for JavaScript errors

---

## Rollback Plan

If admin system malfunctions after launch:

1. **Disable Admin Kill Switch:**
   ```bash
   mongo <MONGODB_URI>
   > db.admincontrolstates.updateOne({ key: 'control_state' }, { $set: { 'value.bookingsPaused': false, 'value.paymentsPaused': false, 'value.registrationsPaused': false } })
   ```

2. **Temporary Solution (Public Access Only):**
   - Set `ADMIN_PRIVATE_PATH_SEGMENT=""` (disables hidden routes)
   - Set `VITE_ADMIN_PANEL_PATH=""` (disables hidden UI)
   - Redeploy backend + frontend
   - Public user flows continue working

3. **Full Rollback:**
   - Deploy previous backend version (before admin system)
   - Deploy previous frontend version
   - Delete admin records: `db.users.deleteOne({ role: 'admin' })`

---

## References

- **Admin Setup Guide:** /HIDDEN_ADMIN_SETUP.md
- **Architecture:** /ARCHITECTURE.md
- **Security:** /SECURITY_AUDIT.md
- **Tests:** `npm run test:security` (50/50 should pass)
- **Backend Routes:** /backend/src/routes/admin.js (715 lines)
- **Frontend Panel:** /src/pages/AdminControlPanel.jsx (360 lines)

---

**✓ All Steps Complete = Production Ready**

Record deployment date: ___________________

Admin email set to: _____________________

Admin private path segment (never share): ___________________
