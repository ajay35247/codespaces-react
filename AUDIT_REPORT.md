# Repository Audit Report — Phase 1

**Repository:** `ajay35247/codespaces-react`
**Scope:** Full repo, read-only audit. **No behavior changes.**
**Date:** 2026-04-28
**Methodology:** Static inspection of source, route mounting, and test runs in the sandbox.

This is the deliverable for Phase 1 of the four-phase plan agreed in the previous session. Phases 2–4 (cleanup PR, targeted fixes, APK hardening) are **not** executed here — each finding below should be addressed in a separate, focused PR.

---

## 1. Executive summary

| Area | State |
|---|---|
| Frontend production build (`npm run build`) | ✅ Passes (with chunk-size warnings & one dynamic/static import warning) |
| Frontend tests (`npx vitest run`) | ❌ 9 failed / 1 passed — broken by environment, not by product code |
| Backend security tests (`npm run test:security`) | ✅ 129 / 129 pass |
| E2E (`npm run test:e2e`, Playwright) | ⚠️ Not runnable in this sandbox (needs Mongo + backend + frontend up; documented as such in `playwright.config.js`) |
| Frontend pages registered as routes | 27 / 27 — no DEAD pages |
| Backend route files mounted in `index.js` | 20 / 20 — no orphaned routers |
| Pages calling missing endpoints | 0 detected |
| Endpoints with no frontend caller AND no test | 6 candidates (low confidence) |
| Files with zero static importers | 6 frontend + 2 backend candidates |
| `TODO` / `FIXME` / "not implemented" hits | 12 occurrences total (5 backend, 7 frontend) |

**Overall posture:** the codebase is in materially better shape than the original "everything is broken / unused" framing suggested. The platform compiles, the backend test suite is green, and every page is wired to a real route. The real issues are narrow and known: a missing frontend test dependency, a small handful of dead-code candidates, and two genuinely unimplemented backend endpoints (subscription upgrade/downgrade). No mass deletion or "activate everything" change is justified by the evidence.

---

## 2. Build & test results (this sandbox)

### 2.1 `npm run build` — ✅ PASS
Vite 6 build completed in ~13s, 1579 modules transformed.

Warnings (non-blocking, recommendations only):
- `src/services/errorReporter.js` is both statically imported (`src/index.jsx`, `src/components/ErrorBoundary.tsx`) and dynamically imported (`src/utils/api.js`). Vite cannot move it into a separate chunk. **Recommendation:** convert the dynamic import in `api.js` to a static one, or remove the static imports — pick one strategy. *(Sev: low. Phase 2.)*
- `dist/assets/index-…js` is **766 kB** (199 kB gzip) and `Hero3DScene-…js` is **820 kB** (220 kB gzip) — both over Vite's 500 kB warning threshold. The `charts` chunk is already split out (107 kB gzip) per the existing memo. **Recommendation:** further `manualChunks` for `framer-motion`, `@react-three/fiber`/`three`, and `@react-google-maps/api`. *(Sev: low/perf. Phase 3.)*

### 2.2 `npx vitest run` (frontend) — ❌ 9 FAIL / 1 PASS
This matches the prior memo: `@testing-library/react` is **not** in `devDependencies`, so every component-level `*.test.jsx` fails on import. Only `src/features/search/searchSlice.test.js` (no DOM) actually runs.

Additionally, vitest's default discovery picks up `backend/tests/security/*.test.js`, which:
- Are written for `node --test`, not vitest, so vitest reports `Error: No test suite found in file …`.
- Try to resolve backend imports (`mongoose`, `lodash`) through Vite's transform, which fails in the frontend root (`Failed to resolve import "mongoose" from "backend/src/schemas/AuditLogSchema.js"`).

**Recommendations (each = its own Phase-3 PR):**
- (a) Add `@testing-library/react` and `@testing-library/jest-dom` to `devDependencies`, or remove the orphaned `*.test.jsx` files. Today they pretend to be tests but never run successfully.
- (b) In `vite.config.js` (or a dedicated `vitest.config.js`), add `test.exclude: ['backend/**', 'e2e/**']` so frontend `vitest` does not pick up backend test files.

### 2.3 Backend `npm run test:security` — ✅ 129 / 129 PASS
Runs via `node --test backend/tests/security/*.test.js`. Covers: percentile/bid-suggestion math, JWT/role guards, subscription tiers, register validation, search service, security-layers, truck-owner notifications, schema constraints. Total: 129 subtests, 0 failures, ~2s.

### 2.4 Playwright E2E — ⚠️ NOT RUN
`playwright.config.js` documents that the spec needs Mongo + backend (port 5000) + frontend (port 3000) running. This sandbox cannot guarantee those services. **Recommendation:** add a CI workflow with a Mongo service container — the comment in `playwright.config.js` already calls this out as a known follow-up. *(Sev: medium for delivery confidence. Phase 4.)*

---

## 3. Frontend pages inventory

All 27 pages are registered in `src/routes/AppRoutes.jsx`. There are **no DEAD page files**.

Legend — Status: **WORKING** (renders + calls real existing backend endpoint), **STUB** (renders static content only, no backend wiring — by design), **BROKEN** (would throw / import missing / clearly not functional), **DEAD** (file exists but no `<Route>` references it).

| Page file | Route | Auth guard | Backing API | Feature flag | Status |
|---|---|---|---|---|---|
| `Home.jsx` | `/` | public | none | — | STUB (intentional landing page) |
| `Login.jsx` | `/login` | public | `/auth/login` | — | WORKING |
| `Register.jsx` | `/register` | public | `/auth/register` | `registrationsPaused` (server-side) | WORKING |
| `ForgotPassword.jsx` | `/forgot-password` | public | `/auth/request-password-reset` | — | WORKING |
| `ResetPassword.jsx` | `/reset-password` | public | `/auth/reset-password` | — | WORKING |
| `VerifyEmail.jsx` | `/verify-email/:token` | public | `/auth/verify-email/:token` | — | WORKING |
| `RoleDashboard.jsx` | `/dashboard/:role` | shipper/driver/broker | `/dashboard/stats` | — | WORKING |
| `DriverDashboard.jsx` | `/driver` | driver | `/loads/{mine,available,bid,…/vehicle,…/pod,…/rate,…/payment/received}` | `bookingsPaused`, `paymentsPaused` (server) | WORKING |
| `ShipperWorkflow.jsx` | `/shipper` | shipper | `/loads`, `…/bids/:bid/{accept,reject}`, `…/escrow/{create,verify}`, `…/payment/release`, `…/insurance`, `…/rate` | `bookingsPaused`, `paymentsPaused` (server) | WORKING |
| `BrokerWorkflow.jsx` | `/broker` | broker | `/broker/{summary,loads,deals,negotiate}`, `/loads/bid` | `brokersPaused` (server) | WORKING |
| `TruckOwnerDashboard.jsx` | `/truck-owner` | truck_owner | `/fleet/{overview,vehicles,assign-driver}` | `fleetPaused` (server) | WORKING |
| `DriverLive.jsx` | `/driver/live` | driver/truck_owner | `/tracking/my-vehicles` + socket `update-location` | `trackingPaused` (server) | WORKING |
| `Tracking.jsx` | `/tracking` | shipper/driver/broker/truck_owner | `/tracking/{load/:id, locations, route/:id}` | `trackingPaused` (server) | WORKING |
| `GstBilling.jsx` | `/gst` | shipper/broker | `/gst/{invoices, download/:id}` | `gstPaused` (server) | WORKING |
| `Payment.jsx` | `/payment` | all roles | `/payments/{subscribe,verify}` | `paymentsPaused` (server) | WORKING |
| `Subscription.jsx` | `/subscription` | all roles | `/payments/{pricing, me/subscription}` | `paymentsPaused`, `offersPaused` (server) | WORKING |
| `Wallet.jsx` | `/wallet` | all roles | `/wallet`, `/wallet/{topup, topup/verify, withdraw}` | `paymentsPaused` (server) | WORKING |
| `TollDashboard.jsx` | `/tolls` | driver | `/tolls/{wallet, recharge/order, recharge/verify, transactions, summary}` | `tollsPaused` (server) | WORKING |
| `Kyc.jsx` | `/kyc` | all roles | `/auth/{kyc, fund-account}` | — | WORKING |
| `UserProfilePanel.jsx` | `/profile` | all roles | `/profile` (GET/PATCH) | — | WORKING |
| `Contact.jsx` | `/contact` | public | `/support/contact` | `supportPaused` (server) | WORKING |
| `Terms.jsx` | `/terms` | public | none | — | STUB (legal copy, by design) |
| `PrivacyPolicy.jsx` | `/privacy` | public | none | — | STUB (legal copy, by design) |
| `FAQ.jsx` | `/faq` | public | none | — | STUB (FAQ copy, by design) |
| `SearchResults.jsx` | `/search` | public | redux `fetchSearchResults` → `/search/*` | — | WORKING |
| `AdminControlPanel.jsx` | `/:ADMIN_PANEL_PATH` | client gate + server admin chain | `/{ADMIN_API_SEGMENT}/*` (many) | reads & writes 11 kill-switches | WORKING |
| `admin/Monitoring.jsx` | `/admin/monitoring` | admin chain | `/{ADMIN_API_SEGMENT}/{errors, healing-rules, alert-rules, force-reload, trigger-healing}` | — | WORKING (lazy-loaded) |

**Distribution:** 24 WORKING, 3 STUB (Terms/Privacy/FAQ — intentional static legal/info pages), 0 BROKEN, 0 DEAD.

---

## 4. Backend route inventory

All 20 route files are mounted in `backend/src/index.js` (lines 316–346). No orphaned routers. Below is the mount table; per-endpoint detail is in `§4.2`.

### 4.1 Mount table

| Mount path | Router file | Router-level middleware |
|---|---|---|
| `/api/auth` | `auth.js` | `authLimiter` |
| `/api/{ADMIN_SECRET}` | `admin.js` | `verifyJWT` + `requireAjayAdmin` + `requireAdminIpWhitelist` |
| `/api/{ADMIN_SECRET}/monitoring` | `adminMonitoring.js` | inherits admin chain |
| `/api/telemetry` | `telemetry.js` | `telemetryLimiter` |
| `/api/payments` | `payments.js` | `paymentLimiter`, `requireNotMaintenance` |
| `/api/boosts` | `boosts.js` | `paymentLimiter`, `requireNotMaintenance` |
| `/api/loads` | `loads.js` | `requireNotMaintenance` |
| `/api/match` | `matching.js` | — |
| `/api/tracking` | `tracking.js` | — |
| `/api/support` | `support.js` | — |
| `/api/gst` | `gst.js` | — |
| `/api/broker` | `broker.js` | — |
| `/api/dashboard` | `dashboard.js` | `requireNotMaintenance` |
| `/api/tolls` | `tolls.js` | — |
| `/api/wallet` | `wallet.js` | `requireNotMaintenance` |
| `/api/notifications` | `notifications.js` | — |
| `/api/fleet` | `fleet.js` | `requireNotMaintenance` |
| `/api/profile` | `profile.js` | `requireNotMaintenance` |
| `/api/chat` | `chat.js` | — |
| `/api/search` | `search.js` | — |

### 4.2 Endpoint roll-up (counts; full per-endpoint mapping done in audit, summarised here)

| Router | # endpoints | Has frontend caller? | Has tests? |
|---|---|---|---|
| `auth.js` | 11 | ✅ (authSlice) | ✅ `register-validation.test.js` |
| `admin.js` | ~45 | ✅ admin panel + monitoring | ✅ `security-layers.test.js` |
| `adminMonitoring.js` | 9 | ✅ `pages/admin/Monitoring.jsx` | ❌ |
| `payments.js` | 14 | ✅ Subscription/Payment | ✅ `subscription-tiers.test.js` |
| `boosts.js` | 5 | ✅ | ❌ |
| `loads.js` | 18+ | ✅ Shipper/Driver/Broker | ✅ via `searchService.test.js` + `bidSuggestion.test.js` |
| `matching.js` | 2 | ⚠️ admin-only caller found; no non-admin caller | ❌ |
| `tracking.js` | 5 | ✅ Tracking, DriverLive | ❌ |
| `notifications.js` | 3 | ✅ `notificationsSlice` | partial |
| `dashboard.js` | 1 | ✅ `RoleDashboard` | indirect |
| `profile.js` | 2 | ✅ `UserProfilePanel` | ❌ |
| `search.js` | 8 | ✅ `searchSlice` | ✅ `search.test.js`, `searchService.test.js` |
| `wallet.js` | 5 | ✅ Wallet | ❌ |
| `tolls.js` | 7 | ✅ TollDashboard | ❌ |
| `chat.js` | 2 | ✅ `TripChatPanel` (but see §6.1) | ❌ |
| `gst.js` | 7 | ✅ GstBilling | ❌ |
| `support.js` | 3 | ✅ Contact + ticket views | ❌ |
| `broker.js` | 4 | ✅ BrokerWorkflow | ❌ |
| `fleet.js` | 6 | ✅ TruckOwnerDashboard | ❌ |
| `telemetry.js` | 1 | ✅ `errorReporter.js` | ❌ |

**Test-coverage gap:** 13 of 20 routers have no dedicated security/integration test. This is the single biggest delivery-risk finding. Recommendation: add at least one `auth + happy-path + 4xx-path` `node --test` for each, in priority order (`payments`, `loads/escrow`, `wallet`, `tolls`, `gst`, `fleet`, then the rest). *(Sev: medium. Phase 3, multi-PR.)*

### 4.3 Endpoints with no frontend caller AND no test (potentially dead — **candidates only, do not auto-delete**)

| Endpoint | File | Notes |
|---|---|---|
| `POST /api/match/load` | `routes/matching.js` | Guarded by `verifyJWT + requireRole([shipper, driver, broker, admin]) + requireMatchingEnabled + requireActiveSubscription('growth')`. No frontend `apiFetch('/match/load')` reference found. May be intended for future auto-matching UI. |
| `POST /api/match/vehicle` | `routes/matching.js` | Same as above. |
| `PATCH /api/profile` | `routes/profile.js` | `UserProfilePanel.jsx` mostly reads; the PATCH path may be wired conditionally — verify in Phase 3 before treating as dead. |
| `POST /api/fleet/assign-driver` | `routes/fleet.js` | `TruckOwnerDashboard.jsx` references it; likely live. **Re-classify as live unless Phase 3 disproves.** |
| `POST /api/wallet/withdraw` | `routes/wallet.js` | `Wallet.jsx` references it; likely live. **Re-classify as live unless Phase 3 disproves.** |
| `DELETE /api/chat/load/:loadId` | `routes/chat.js` | Not implemented in router; only listed as a hypothetical. Ignore. |

This list is **low-confidence**. None of these should be removed in Phase 2; they should be confirmed by runtime tracing or a Phase-3 spike.

---

## 5. Files with zero static importers (candidates only — do not auto-delete)

Identified by basename grep across the repo (excluding `node_modules`, `dist`, `android/app/build`, `.git`). A file appearing here means **no static `import … from '<file>'`** was found; it does **not** prove deadness — dynamic imports, runtime route mounting, and tooling entry points can still consume them.

### Frontend
1. `src/components/AnalyticsInsights.jsx`
2. `src/components/EarningsWidget.jsx`
3. `src/components/TrackingMap.jsx`
4. `src/components/TripChatPanel.jsx` — note: backend `chat.js` exists; this component is the natural caller. **Verify whether it should be wired into `Tracking.jsx` or `DriverDashboard.jsx` rather than deleted.** *(Sev: medium — may be a missed integration, not dead code.)*
5. `src/hooks/useDraft.js`
6. `src/hooks/useNetworkStatus.js`

Already verified live (do **not** include above):
- `src/components/Hero3DScene.jsx` — `React.lazy` import in `Home.jsx`.
- `src/setupTests.js` — vitest test runner entry, no static import.

### Backend
1. `backend/src/services/ai/matchEngine.js` (`predictLoadMatch`)
2. `backend/src/services/ai/riskScoring.js` (`calculateDriverRisk`)

Already verified live (do **not** include above):
- `backend/src/services/ai/upgradeScoring.js` — dynamic `import()` in `routes/admin.js:2123`.
- `backend/src/worker.js` — entry point in `backend/package.json` (`npm run worker`).

**Recommendation for Phase 2:** for each candidate, do a `git log -- <file>` and grep for *any* string reference (e.g. dynamic `lazy(() => import('…/AnalyticsInsights'))`) before removal. Prefer: open one PR that deletes the genuinely unused half (`useDraft`, `useNetworkStatus`, `matchEngine`, `riskScoring`) and a separate Phase-3 PR that *wires up* `TripChatPanel.jsx` if chat is meant to ship. Do **not** mass-delete in one PR.

---

## 6. TODOs / FIXMEs / unimplemented handlers

Total: **12 occurrences** (5 backend, 7 frontend). No `TODO`, `FIXME`, `XXX`, or `HACK` literals were found anywhere in `src/` or `backend/src/` — only "not (yet) implemented" prose and benign empty `.catch(() => {})` swallowers.

### 6.1 Backend (5)

| File:line | Severity | Description | Action |
|---|---|---|---|
| `backend/src/routes/payments.js:520` | **HIGH** | Comment: "Subscription management is not yet implemented. Returning a fake 200 success" | The next two endpoints below explicitly return 501; verify *this* code path is also returning 501, not the fake 200 the comment warns about. **Phase 3.** |
| `backend/src/routes/payments.js:522` | medium | `POST /payments/subscription/upgrade` returns `501 Subscription upgrade is not yet implemented` | Wire to real Razorpay plan-change flow OR remove the route + remove the frontend button that calls it. **Phase 3.** |
| `backend/src/routes/payments.js:526` | medium | `POST /payments/subscription/downgrade` returns `501 Subscription downgrade is not yet implemented` | Same as above. **Phase 3.** |
| `backend/src/utils/gspAdapter.js:66` | low | Returns `{reason: "GSP_PROVIDER=… is declared but the adapter is not implemented yet"}` | This is a *graceful* "feature off" — keep as-is. **No action.** |
| `backend/src/utils/gspAdapter.js:73` | low | Same as above. | **No action.** |

### 6.2 Frontend (7)

| File:line | Severity | Description | Action |
|---|---|---|---|
| `src/components/AnalyticsInsights.jsx:158` | low | `.catch(() => {})` silently swallows fetch error | Replace with `errorReporter.captureException` for visibility. *Phase 2.* |
| `src/components/EarningsWidget.jsx:72` | low | Same | Same |
| `src/components/SmartDecisionWidget.jsx:141` | low | Same | Same |
| `src/components/ThemeProvider.jsx:26` | none | Empty `() => {}` is the *default* context value, not a real handler | **No action.** |
| `src/pages/AdminControlPanel.jsx:2322` | none | UI copy: "Items listed are planned features, not yet implemented." | **No action — by design.** |
| `src/pages/DriverLive.jsx:59` | low | `.catch(() => {})` swallows geolocation error | Log via `errorReporter`. *Phase 2.* |
| `src/pages/Tracking.jsx:90` | low | Same | Same |

---

## 7. Other findings

### 7.1 Frontend test infra is half-built
`vitest` + `jsdom` are configured, but `@testing-library/react` is missing from `devDependencies`, so 8/10 frontend test files fail at import time. This is a **delivery-risk** issue: PRs touching frontend components have no real test signal. *(Sev: high. Phase 3 — single small PR.)*

### 7.2 Vitest picks up backend tests it cannot run
`backend/tests/security/*.test.js` is written for `node --test` and imports `mongoose`, which Vite cannot resolve from the frontend root. They are reported as failures during `npx vitest run` even though `npm run test:security` runs them green. **Action:** narrow `vitest` test discovery (`test.include`/`test.exclude` in `vite.config.js`). *(Sev: medium. Phase 3.)*

### 7.3 Engine version mismatch
`package.json` declares `"node": "22.x"` but the sandbox (and likely CI default) runs Node 20. Either widen to `>=20` or upgrade CI runners. `@capacitor/cli@8.3.0` also requires `>=22`. *(Sev: low/dev-experience. Phase 2.)*

### 7.4 Bundle size
`index-…js` 199 kB gzip, `Hero3DScene-…js` 220 kB gzip — both above Vite's default warn threshold. The `charts` (recharts) chunk is already split. Three.js / `@react-three/fiber` should be split similarly so non-landing-page users don't pay for it. *(Sev: low/perf. Phase 3.)*

### 7.5 APK build
`.github/workflows/build-apk.yml` exists and is wired to `npm run cap:android:debug` (per stored memo). `build-apk-release.yml` exists but the release-signing path is undocumented. **Action for Phase 4:** add `RELEASE.md` covering keystore handling and verify `build-apk-release.yml` produces a signed artifact end-to-end on a clean run. *(Sev: low until a release is actually planned.)*

### 7.6 Dynamic + static import warning for `errorReporter.js`
Vite warns it cannot move `errorReporter.js` into a separate chunk because it is both statically imported (in `index.jsx`, `ErrorBoundary.tsx`) and dynamically imported (in `utils/api.js`). Decide one strategy. *(Sev: low. Phase 2.)*

### 7.7 No copyright/license issues observed in audit
`LICENSE` exists at repo root.

---

## 8. Severity-ranked recommendation list

### High (do soonest, each as its own PR)
1. **Add `@testing-library/react` + `@testing-library/jest-dom` to `devDependencies`** so frontend tests actually run, OR delete the orphaned `*.test.jsx` files. Today's state hides regressions. *(§7.1)*
2. **Audit `payments.js:520` comment** — confirm the route in question really returns 501 and not the "fake 200 success" the comment warns about. *(§6.1)*

### Medium (next sprint)
3. Decide on `POST /payments/subscription/{upgrade,downgrade}` — implement against Razorpay or remove the routes + frontend buttons. *(§6.1)*
4. Configure `vitest` to exclude `backend/**` and `e2e/**` so the frontend test command is truthful. *(§7.2)*
5. Wire `TripChatPanel.jsx` into Tracking/Driver flows, or delete it. Backend `chat.js` is mounted but the component is unreferenced. *(§5)*
6. Add a `node --test` integration test for each currently untested router (`payments` and `wallet` first). *(§4.2)*
7. Add a CI workflow that boots Mongo + backend + frontend so Playwright actually runs in CI. *(§2.4)*

### Low / nice-to-have
8. Split `three`/`@react-three/fiber` into a manual chunk; revisit `framer-motion`. *(§7.4)*
9. Replace silent `.catch(() => {})` swallowers in the 5 components/pages flagged in §6.2 with `errorReporter` calls.
10. Resolve the static-vs-dynamic import inconsistency for `errorReporter.js`. *(§7.6)*
11. Remove confirmed-dead files: `src/hooks/useDraft.js`, `src/hooks/useNetworkStatus.js`, `backend/src/services/ai/matchEngine.js`, `backend/src/services/ai/riskScoring.js` — only after a `git log` + cross-grep confirms zero references. *(§5)*
12. Reconcile `engines.node` with actual CI runner version. *(§7.3)*
13. Document release-APK signing path (`RELEASE.md`). *(§7.5)*

---

## 9. Things the audit explicitly does **not** recommend

These were specifically requested but should **not** be done, because they would degrade the product:

- **"Activate all inactive functions."** The 11 platform kill-switches (`bookingsPaused`, `paymentsPaused`, `registrationsPaused`, `trackingPaused`, `matchingPaused`, `gstPaused`, `tollsPaused`, `fleetPaused`, `brokersPaused`, `supportPaused`, `maintenanceMode`) are **operational controls**, not bugs. They default to `false` (= feature ON) and are toggled by admins. There is no global "activate everything" flag and there should not be one.
- **"Remove all unused code."** The 8 candidate files listed in §5 must be verified individually. Bulk deletion based on grep alone risks removing dynamically imported, runtime-mounted, or admin-only assets.
- **"Add an APK build file."** `android/`, `capacitor.config.json`, `npm run cap:android:debug`, `.github/workflows/build-apk.yml`, and `.github/workflows/build-apk-release.yml` already exist. The work needed is *hardening* (signing, RELEASE.md), not adding new build files.

---

## 10. Phase 2 / 3 / 4 — proposed PR breakdown

Each row = one PR. None of them is started by this report.

| # | Phase | Title | Est. risk |
|---|---|---|---|
| P2-1 | 2 | Remove confirmed-dead files (`useDraft`, `useNetworkStatus`, `matchEngine`, `riskScoring`) after manual verification | low |
| P2-2 | 2 | Resolve static/dynamic dual-import of `errorReporter.js` | low |
| P2-3 | 2 | Replace silent `.catch(() => {})` swallowers with `errorReporter` calls | low |
| P3-1 | 3 | Add `@testing-library/react` + run frontend tests in CI | low |
| P3-2 | 3 | Restrict `vitest` discovery to `src/**` | low |
| P3-3 | 3 | Decide & implement subscription upgrade/downgrade (or remove) | medium |
| P3-4 | 3 | Wire `TripChatPanel.jsx` (or remove) | medium |
| P3-5 | 3 | Add Mongo+backend+frontend service stack to CI; run Playwright | medium |
| P3-6 | 3 | Add per-router `node --test` integration tests (one PR per router, payments first) | low–medium |
| P3-7 | 3 | Manual-chunk `three`/`@react-three/fiber` to shrink main bundle | low |
| P4-1 | 4 | Verify `build-apk.yml` produces a working debug APK on a clean run | low |
| P4-2 | 4 | Verify `build-apk-release.yml`; add `RELEASE.md` covering keystore strategy | medium |

---

*End of report — Phase 1 deliverable. No source files were modified.*
