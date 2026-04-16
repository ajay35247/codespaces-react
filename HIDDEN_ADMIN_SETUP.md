# Hidden Single-Admin Authority System — Complete Implementation Guide

This logistics marketplace platform now features a **completely hidden**, **single-admin** control authority system that is **never visible** to normal users, with full CEO-level operational control while maintaining public userface integrity.

## Quick Start & Environment Setup

### Backend Admin Credentials
Set these environment variables to activate/configure the hidden admin system:

```bash
# Admin identity (email must exist in ADMIN_EMAIL)
export ADMIN_EMAIL="ajay35247@gmail.com"
export ADMIN_BOOTSTRAP_PASSWORD="Sharma@76210"

# Secret admin API path segment (SHA256 hashed as security through obscurity layer)
# Default: "_ops_console_f91b7c"
export ADMIN_PRIVATE_PATH_SEGMENT="_ops_console_f91b7c"

# Optional: IP whitelisting for admin access
# Comma-separated IPs: "192.168.1.10,10.0.0.5"
export ADMIN_IP_WHITELIST=""

# Standard JWT secrets (used for both public and admin tokens)
export JWT_SECRET="your-secret-key"
export JWT_REFRESH_SECRET="your-refresh-secret-key"
```

### Frontend Admin Panel Access
Set these environment variables for the hidden admin panel URL:

```bash
# Hidden admin panel route (default: /ops-bridge-93a1)
export VITE_ADMIN_PANEL_PATH="/ops-bridge-93a1"

# Hidden admin API segment (must match backend ADMIN_PRIVATE_PATH_SEGMENT)
export VITE_ADMIN_API_SEGMENT="_ops_console_f91b7c"

export VITE_API_URL="http://localhost:5000"
```

---

## CRITICAL SECURITY RULES

1. **ONLY ONE ADMIN EXISTS** — Database-enforced unique partial index on `role='admin'`
2. **ADMIN NEVER IN PUBLIC AUTH** — Public `/api/auth/login` instantly rejects admin role
3. **ADMIN NOT VISIBLE IN UI** — Admin role completely removed from role cards, dashboards, navigation
4. **HIDDEN ROUTES ONLY** — Admin APIs mounted on `/api/{ADMIN_PRIVATE_PATH_SEGMENT}/*` (secret path)
5. **NO HARDCODED DEFAULTS** — Admin email/password must be set via environment variables
6. **SEPARATE SESSION TRACKING** — Admin sessions stored separately with device ID + IP logging

---

## Hidden Admin Access Flow

### 1. Login to Hidden Admin Panel
- Navigate to: `http://localhost:3000/{VITE_ADMIN_PANEL_PATH}` (e.g., `/ops-bridge-93a1`)
- Not linked anywhere in the public UI
- Enter admin email and password
- Receive MFA code via email
- Verify MFA code (6 digits)
- Redirected to control tower dashboard

### 2. Admin Session Management
- Sessions tracked in `AdminSession` collection
- Device ID + IP address recorded
- Separate refresh token chain from public auth
- Logout from all devices: `/api/{segment}/auth/logout-all`
- View active sessions: `/api/{segment}/auth/sessions`

### 3. Admin Panel UI Features (Hidden Route)
- **Control Tower Dashboard** — Real-time platform metrics
- **Kill Switch Controls** — Pause bookings, payments, registrations instantly
- **User Management** — Suspend/block/activate users, reset passwords, view KYC status
- **Pricing Plans** — Create, edit, rollback plans with version control
- **Revenue Dashboard** — Payment flows, subscription revenue, ledger summary
- **Fraud Detection** — View fraud events, high-risk users, auto-freeze accounts
- **Automation Rules** — Define if-then business triggers
- **AI Decision Logs** — Review and approve/reject AI pricing + matching decisions
- **Audit Logs** — Full admin action history with old/new values

---

## Backend Hidden Admin Routes

All admin routes: `POST /api/{ADMIN_PRIVATE_PATH_SEGMENT}/{endpoint}`

### Authentication Endpoints
```
POST   /auth/login                    — Admin login (returns MFA challenge)
POST   /auth/login/mfa-verify         — MFA verification
POST   /auth/refresh-token            — Refresh access token
POST   /auth/logout                   — Logout single session
POST   /auth/logout-all               — Logout all sessions
GET    /auth/sessions                 — List active admin sessions
```

### Control & Management Endpoints
```
GET    /control/users                 — List all users (paginated)
PATCH  /control/users/:id/status      — Change user account status
PATCH  /control/users/:id/kyc         — Approve/reject KYC
POST   /control/users/:id/reset-password — Reset user password
POST   /control/users/:id/impersonate — Issue impersonation token
GET    /control/loads                 — View all loads
GET    /control/payments              — View all payments
PATCH  /control/override              — Global override (booking, trip, payment)
POST   /control/kill-switch           — Enable/disable platform operations
GET    /control/kill-switch           — Check current kill switch state
```

### Pricing Management Endpoints
```
POST   /pricing/plans                 — Create new plan
GET    /pricing/plans                 — List all plans
PATCH  /pricing/plans/:id             — Update plan pricing/features
POST   /pricing/plans/:id/rollback    — Rollback to previous version
```

### Revenue & Ledger Endpoints
```
POST   /revenue/ledger/entry          — Record ledger entry (double-entry)
GET    /revenue/summary               — Total revenue snapshot
```

### Fraud & Risk Endpoints
```
POST   /fraud/events                  — Create fraud event (auto-freeze if high risk)
GET    /fraud/events                  — List fraud events
```

### Automation Endpoints
```
POST   /automation/rules              — Create automation rule
GET    /automation/rules              — List all rules
```

### AI Control Endpoints
```
POST   /ai/decision-logs              — Log AI decision
PATCH  /ai/decision-logs/:id/review   — Approve/reject AI decision
GET    /ai/decision-logs              — List AI decision logs
```

### Analytics Endpoints
```
GET    /analytics/control-tower       — Real-time control tower metrics
GET    /audit/actions                 — Admin action audit trail
```

---

## Data Models Created

### Supporting Collections (New)

1. **AdminSession** — Track admin logins, devices, IP addresses
2. **AdminControlState** — Store platform control settings (kill switch, etc.)
3. **SubscriptionPlan** — Pricing plans with version history and rollback
4. **LedgerEntry** — Double-entry accounting for revenue tracking
5. **FraudEvent** — Fraud detection events with severity + auto-freeze logic
6. **AutomationRule** — IF-THEN business automation rules
7. **AiDecisionLog** — AI decision audit with explanations + override capability

### User Schema Updates
- `accountStatus` — active / suspended / blocked / deleted
- `kycStatus` — pending / approved / rejected
- `walletFrozen` — Boolean flag for instant wallet freeze
- `shadowModeEnabled` — Boolean flag for shadow mode monitoring
- Unique partial index on `{ role: 'admin' }` — Enforces exactly one admin

---

## Public User Flow (Unchanged)

### Registration (Public)
```
POST /api/auth/register
  role: shipper | driver | fleet-manager | broker  (NOT admin)
  
  ✅ CANNOT select admin role
  ❌ Admin role auto-rejected
```

### Login (Public)
```
POST /api/auth/login
  (admin role instantly rejected with 401)
  
  ✅ Normal users redirected to `/dashboard/{role}`
  ❌ Admin accounts return "Invalid credentials"
```

### Kill Switch Enforcement
- **Registrations Paused** — `/api/auth/register` returns 503
- **Bookings Paused** — `/api/loads/bid` returns 503
- **Payments Paused** — `/api/payments/subscribe` returns 503

---

## Kill Switch Control

Admin can instantly pause/resume platform operations:

```bash
# Pause everything
curl -X POST http://localhost:5000/api/{segment}/control/kill-switch \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingsPaused": true,
    "paymentsPaused": true,
    "registrationsPaused": true
  }'

# Check status
curl http://localhost:5000/api/{segment}/control/kill-switch \
  -H "Authorization: Bearer {admin_token}"
```

Response:
```json
{
  "value": {
    "bookingsPaused": true,
    "paymentsPaused": true,
    "registrationsPaused": true
  }
}
```

---

## Revenue Control

### Double-Entry Ledger
Every transaction creates two entries:

```bash
POST /api/{segment}/revenue/ledger/entry
{
  "sourceType": "booking|subscription|manual-adjustment|refund|settlement",
  "debit": 0,
  "credit": 10000,
  "accountCode": "user_wallet_123",
  "counterpartyAccountCode": "platform_earnings"
}
```

### Revenue Summary
```bash
GET /api/{segment}/revenue/summary

{
  "payments": {
    "success": 500000,
    "failed": 0,
    "refund": 0,
    "pending": 0
  },
  "subscriptionRevenue": 250000,
  "ledger": {
    "totalCredit": 750000,
    "totalDebit": 250000
  }
}
```

---

## Fraud & Risk Detection

### Create Fraud Event (Auto-Freeze if High Risk)
```bash
POST /api/{segment}/fraud/events
{
  "eventType": "fake-booking|abnormal-pricing|repeated-cancellation|wallet-abuse|manual-flag",
  "severity": "low|medium|high|critical",
  "riskScore": 87,
  "description": "Unusual booking pattern from user XYZ",
  "actorUserId": "user_id_here"
}
```

**Auto-Freeze Logic:**
- If `riskScore >= 85`: User wallet instantly frozen + account blocked

---

## Pricing Plan Version Control

### Create Plan
```bash
POST /api/{segment}/pricing/plans
{
  "name": "Premium Monthly",
  "code": "PREM_MONTH",
  "pricing": { "monthly": 2999, "quarterly": 8999, "yearly": 29999 },
  "trialDays": 7,
  "taxPercent": 18,
  "featureMapping": [
    { "key": "unlimited_loads", "enabled": true }
  ]
}
```

### Update Pricing (with Rollback Support)
```bash
PATCH /api/{segment}/pricing/plans/{planId}
{
  "pricing": { "monthly": 3299, "quarterly": 9999, "yearly": 32999 },
  "scheduleAt": "2026-05-01T00:00:00Z",
  "applyOnRenewalOnly": true
}
```

### Rollback to Previous Version
```bash
POST /api/{segment}/pricing/plans/{planId}/rollback
{
  "targetVersion": 2
}
```

All price changes tracked with old/new values + admin user + timestamp.

---

## Audit Logging

Every admin action logged with:
- Admin email + user ID
- Action type (e.g., "ADMIN_USER_STATUS_UPDATE")
- Resource + resource ID
- IP address + user agent
- Method + path + HTTP status
- Old value + new value (metadata)
- Timestamp

Query admin audit trail:
```bash
GET /api/{segment}/audit/actions?limit=50 \
  -H "Authorization: Bearer {admin_token}"
```

---

## Security Best Practices

### Initial Admin Setup
```bash
# 1. Set secure env vars (production secret management)
export ADMIN_EMAIL="your-admin@company.com"
export ADMIN_BOOTSTRAP_PASSWORD="ComplexP@ss123!"
export ADMIN_PRIVATE_PATH_SEGMENT="your-random-path-abc123"

# 2. Boot backend (creates admin account if not exists)
npm start

# 3. Backend enforces exactly one admin
#    If multiple admin accounts detected, server crashes with error

# 4. Access admin panel at hidden URL (never shared publicly)
# Frontend: /ops-bridge-93a1
# Backend: /api/{segment}/{endpoint}
```

### IP Whitelisting (Optional)
```bash
export ADMIN_IP_WHITELIST="203.0.113.10,198.51.100.20"
```

Only these IPs can access admin APIs.

### Device Tracking
Every admin login records:
- Device ID (from x-device-id header)
- IP address
- User agent
- Login timestamp

Admin can view active devices:
```bash
GET /api/{segment}/auth/sessions
```

---

## Testing

### Run Security Tests
```bash
cd backend
npm run test:security
```

Expected output: **50/50 tests passing**

Verifies:
- Single admin enforcement
- Email normalization
- Strong password policy
- MFA flow
- JWT signing/verification
- Role-based access control
- Audit logging

---

## Deployment Notes

### Database Migrations
1. Create index on `User` collection:
   ```javascript
   db.users.createIndex({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } })
   ```

2. Ensure `AdminSession`, `AdminControlState`, and other admin schemas are created automatically on first access (Mongoose auto-create).

### Environment Variables (Production)
- Use AWS Secrets Manager / Azure Key Vault for sensitive values
- Never commit `.env` files
- Use environment-specific secrets for each deployment stage

### Rate Limiting
- Admin auth: 8 requests / 15 min per IP
- Admin can still bypass if IP-whitelisted

### Monitoring
- Monitor `AdminSession` collection for unusual access patterns
- Set alerts for failed admin MFA attempts
- Log all kill switch activations to Slack/PagerDuty

---

## FAQs

**Q: What if I lose the admin password?**
A: Set `ADMIN_BOOTSTRAP_PASSWORD` to new value, delete the admin user document from MongoDB, restart backend. New admin account created.

**Q: Can users see the admin role in the system?**
A: No. Role is in database only. Public APIs reject admin login. UI never shows admin option.

**Q: What about mobile app?**
A: Mobile app uses same backend. Same hidden admin controls apply. No special mobile admin feature.

**Q: Can I have multiple admins?**
A: No. System enforces exactly one admin via database unique partial index. Creating second admin will fail.

**Q: How do I permanently delete all admin data?**
A: Delete all records in `AdminSession`, `AdminControlState`, and the admin user document. Restart backend.

---

## Troubleshooting

### Admin Panel not loading
1. Check `VITE_ADMIN_PANEL_PATH` vs actual URL
2. Verify frontend built: `npm run build`
3. Check browser console for errors

### Admin login fails with "Invalid credentials"
1. Verify `ADMIN_EMAIL` environment variable matches account email
2. Verify `ADMIN_BOOTSTRAP_PASSWORD` is set and known
3. Check `/api/health` endpoint admin path hash displays correctly

### Kill switch endpoints return 403
1. Verify JWT token is valid and not expired
2. Check IP whitelisting: if set, your IP must be in list
3. Verify `requireAjayAdmin` middleware passes (email + role validation)

### Pricing rollback fails
1. Ensure target version < current version
2. Check Audit log: `GET /api/{segment}/audit/actions`

---

This system ensures absolute security through:
✅ Single admin (database enforced)
✅ Hidden routes (secret path segment)
✅ Complete UI removal (normal users never see admin)
✅ Separate auth flow (admin MFA separate from normal login)
✅ Full audit trail (every action logged)
✅ Kill switch capability (instant platform pause/resume)
✅ CEO-level controls (user, pricing, revenue, fraud, AI, automation)
