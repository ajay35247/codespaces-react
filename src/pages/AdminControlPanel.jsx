import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl, getApiErrorMessage, parseApiBody } from '../utils/api';
import { AdminShell } from '../components/admin/AdminShell';
import { MissionControl } from '../components/admin/MissionControl';
import { CommandPalette, useCommandPaletteShortcut } from '../components/admin/CommandPalette';
import { AdminSearchPanel } from '../components/admin/AdminSearchPanel';

const ADMIN_API_SEGMENT = import.meta.env.VITE_ADMIN_API_SEGMENT || import.meta.env.VITE_ADMIN_PRIVATE_PATH_SEGMENT || '';

const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Reads the non-HttpOnly `csrf-token` cookie that the backend sets via
// setAuthCookies(). This implements the double-submit cookie pattern enforced
// by the inline CSRF guard in backend/src/index.js (and csrfProtection.js).
function getAdminCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function api(path, method = 'GET', body) {
  const csrfHeaders = CSRF_METHODS.has(method.toUpperCase())
    ? { 'X-CSRF-Token': getAdminCsrfToken() }
    : {};

  const response = await fetch(buildApiUrl(`/${ADMIN_API_SEGMENT}${path}`), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': 'web-control-panel',
      ...csrfHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseApiBody(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Request failed'));
  }
  return data;
}

const FEATURE_FLAGS = [
  { key: 'maintenanceMode',      label: 'Maintenance Mode',      description: 'Blocks ALL non-admin API endpoints',           danger: true  },
  { key: 'bookingsPaused',       label: 'Pause Bookings',        description: 'Prevents new loads from being created',        danger: false },
  { key: 'paymentsPaused',       label: 'Pause Payments',        description: 'Blocks subscriptions and toll recharges',      danger: false },
  { key: 'registrationsPaused',  label: 'Pause Registrations',   description: 'Prevents new user accounts from being created',danger: false },
  { key: 'trackingPaused',       label: 'Pause Tracking',        description: 'Disables GPS tracking API endpoints',          danger: false },
  { key: 'matchingPaused',       label: 'Pause Load Matching',   description: 'Disables AI/load-matching engine',             danger: false },
  { key: 'gstPaused',            label: 'Pause GST Invoicing',   description: 'Prevents new GST invoices from being created', danger: false },
  { key: 'tollsPaused',          label: 'Pause Tolls',           description: 'Blocks FASTag wallet recharge orders',         danger: false },
  { key: 'brokersPaused',        label: 'Pause Brokers',         description: 'Disables all broker routes',                   danger: false },
  { key: 'supportPaused',        label: 'Pause Support',         description: 'Prevents new support ticket submissions',      danger: false },
  { key: 'offersPaused',         label: 'Stop All Offers',       description: 'Disables every active subscription offer/coupon platform-wide', danger: true  },
];

const DEFAULT_FLAGS = Object.fromEntries(FEATURE_FLAGS.map(({ key }) => [key, false]));

const USERS_FETCH_LIMIT = 100;

// Mirrors BILLING_CYCLES in backend/src/schemas/SubscriptionPlanSchema.js — keep
// in sync if the backend list changes. The order here is the order rendered in
// the pricing editor.
const BILLING_CYCLES = [
  { key: 'daily',      label: 'Daily' },
  { key: 'weekly',     label: 'Weekly' },
  { key: 'fifteenDay', label: '15-day' },
  { key: 'monthly',    label: 'Monthly' },
  { key: 'quarterly',  label: 'Quarterly' },
  { key: 'halfYearly', label: 'Half-yearly' },
  { key: 'yearly',     label: 'Yearly' },
];

const EMPTY_PRICING = BILLING_CYCLES.reduce((acc, c) => { acc[c.key] = ''; return acc; }, {});

const EMPTY_PLAN_FORM = {
  name: '', code: '', description: '',
  pricing: { ...EMPTY_PRICING },
  trialDays: 0, taxPercent: 0, platformFeePercent: 0,
  active: true,
};

// ── Offer quick-launch templates ────────────────────────────────────────────
// Pre-fill the offer creation form for common promotion scenarios so the
// admin doesn't have to type dates / discounts from scratch each time.
const OFFER_TEMPLATES = [
  { name: 'Diwali Bonanza',      type: 'festival', label: '🎉 Diwali Offer',       discountPercent: 25, durationDays: 7   },
  { name: 'Flash Sale',          type: 'flat',     label: '⚡ 24-Hour Flash Sale',  discountPercent: 40, durationDays: 1   },
  { name: 'Holi Spring Sale',    type: 'festival', label: '🎨 Holi Offer',         discountPercent: 20, durationDays: 2   },
  { name: 'New Year Kickstart',  type: 'festival', label: '🎊 New Year Offer',     discountPercent: 30, durationDays: 5   },
  { name: 'Independence Day',    type: 'festival', label: '🇮🇳 Independence Day',  discountPercent: 15, durationDays: 3   },
  { name: 'Republic Day',        type: 'festival', label: '🇮🇳 Republic Day',      discountPercent: 20, durationDays: 3   },
  { name: 'Loyalty Reward',      type: 'coupon',   label: '🏆 Loyal Customer',     discountPercent: 15, durationDays: 30, couponCode: 'LOYAL15'    },
  { name: 'Win-back Campaign',   type: 'coupon',   label: '💔 We Miss You',        discountPercent: 50, durationDays: 7,  couponCode: 'COMEBACK50' },
  { name: 'Early Adopter',       type: 'coupon',   label: '🚀 Early Adopter',      discountPercent: 35, durationDays: 14, couponCode: 'EARLY35'    },
];

function updateItemById(setter, id, updates) {
  setter((prev) => prev.map((item) => item._id === id ? { ...item, ...updates } : item));
}

export function AdminControlPanel() {
  const [admin, setAdmin] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaExpiresInSeconds, setMfaExpiresInSeconds] = useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendingMfa, setResendingMfa] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const [users, setUsers] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loads, setLoads] = useState([]);
  const [payments, setPayments] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [gstInvoices, setGstInvoices] = useState([]);
  const [offers, setOffers] = useState([]);
  const [offerForm, setOfferForm] = useState({
    name: '', type: 'festival', label: '', discountPercent: 25,
    startsAt: '', endsAt: '', appliesToPlanCodes: '', couponCode: '', usageLimit: '',
  });
  const [offerSaving, setOfferSaving] = useState(false);
  const [pricingForm, setPricingForm] = useState(EMPTY_PLAN_FORM);
  const [pricingCreating, setPricingCreating] = useState(false);
  // Per-plan editable draft, keyed by plan._id. Populated lazily when an admin
  // opens a plan's editor so the rendered values reflect server state until
  // explicit edits are made.
  const [pricingDrafts, setPricingDrafts] = useState({});
  const [pricingSavingId, setPricingSavingId] = useState(null);
  const [pricingRollbackTarget, setPricingRollbackTarget] = useState({});
  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FLAGS);
  const [activeTab, setActiveTab] = useState('overview');
  const [userAction, setUserAction] = useState({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Default landing tab is the new mission-control dashboard. Use a state flag
  // so this only runs once per mount; otherwise an admin navigating back to
  // "overview" would be bounced to "dashboard" again.
  const [didDefaultDashboard, setDidDefaultDashboard] = useState(false);

  // Global ⌘K / Ctrl+K / "/" shortcut for the command palette.
  useCommandPaletteShortcut(useCallback(() => setPaletteOpen(true), []));

  const authenticated = useMemo(() => Boolean(admin), [admin]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrapAdminSession() {
      try {
        const data = await api('/auth/me');
        if (cancelled) return;
        setAdmin(data.admin || null);
      } catch {
        if (cancelled) return;
        setAdmin(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }
    bootstrapAdminSession();
    return () => { cancelled = true; };
  }, []);

  // Login uses the same csrf cookie pattern; on first login no auth cookie
  // is present, so the backend skips CSRF entirely.
  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/login', 'POST', { email: email.trim().toLowerCase(), password });
      setMfaRequired(true);
      setMfaChallengeToken(data.mfaChallengeToken);
      setMfaExpiresInSeconds(data.expiresInSeconds || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/login/mfa-verify', 'POST', {
        email: email.trim().toLowerCase(),
        mfaChallengeToken,
        mfaCode,
      });
      setAdmin(data.admin);
      setMfaRequired(false);
      setMfaCode('');
      await loadDashboard(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaResend = async () => {
    setResendingMfa(true);
    setError('');
    try {
      const data = await api('/auth/login/mfa-resend', 'POST', {
        email: email.trim().toLowerCase(),
        mfaChallengeToken,
      });
      setMfaExpiresInSeconds(data.expiresInSeconds || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingMfa(false);
    }
  };

  const loadDashboard = useCallback(async (adminData) => {
    if (!(adminData ?? admin)) return;
    setLoading(true);
    setError('');
    try {
      const [
        usersData, plansData, revenueData, flagsData,
        analyticsData, auditData, loadsData, paymentsData,
        ticketsData, invoicesData, offersData,
      ] = await Promise.all([
        api(`/control/users?limit=${USERS_FETCH_LIMIT}`),
        api('/pricing/plans'),
        api('/revenue/summary'),
        api('/control/kill-switch'),
        api('/analytics/control-tower'),
        api('/audit/actions?limit=50'),
        api('/control/loads'),
        api('/control/payments'),
        api('/control/support/tickets?limit=50'),
        api('/control/gst/invoices?limit=50'),
        api('/offers'),
      ]);

      setUsers(usersData.users || []);
      setPricingPlans(plansData.plans || []);
      setRevenue(revenueData);
      setFeatureFlags({ ...DEFAULT_FLAGS, ...(flagsData.value || {}) });
      setAnalytics(analyticsData);
      setAuditLogs(auditData.logs || []);
      setLoads(loadsData.loads || []);
      setPayments(paymentsData.payments || []);
      setSupportTickets(ticketsData.tickets || []);
      setGstInvoices(invoicesData.invoices || []);
      setOffers(offersData.offers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    loadDashboard();
  }, [admin, loadDashboard]);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      await api('/auth/refresh-token', 'POST');
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!admin) return;
    setLoading(true);
    setError('');
    try {
      await api('/auth/logout-all', 'POST', {});
      setAdmin(null);
      setUsers([]);
      setPricingPlans([]);
      setRevenue(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeatureFlagsSave = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/control/kill-switch', 'POST', featureFlags);
      setFeatureFlags({ ...DEFAULT_FLAGS, ...(data.value || {}) });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUserStatus = async (userId, status) => {
    setUserAction((prev) => ({ ...prev, [userId]: { loading: true, error: '' } }));
    try {
      await api(`/control/users/${userId}/status`, 'PATCH', { status });
      updateItemById(setUsers, userId, { accountStatus: status });
      setUserAction((prev) => ({ ...prev, [userId]: { loading: false, error: '' } }));
    } catch (err) {
      setUserAction((prev) => ({ ...prev, [userId]: { loading: false, error: err.message } }));
    }
  };

  const handleUserKyc = async (userId, kycStatus) => {
    setUserAction((prev) => ({ ...prev, [userId]: { loading: true, error: '' } }));
    try {
      await api(`/control/users/${userId}/kyc`, 'PATCH', { kycStatus });
      updateItemById(setUsers, userId, { kycStatus });
      setUserAction((prev) => ({ ...prev, [userId]: { loading: false, error: '' } }));
    } catch (err) {
      setUserAction((prev) => ({ ...prev, [userId]: { loading: false, error: err.message } }));
    }
  };

  const handleTicketStatus = async (ticketId, status) => {
    try {
      await api(`/control/support/tickets/${ticketId}/status`, 'PATCH', { status });
      updateItemById(setSupportTickets, ticketId, { status });
    } catch (err) {
      setError(err.message);
    }
  };

  // NOTE: All hooks must be declared before the early returns below to satisfy
  // the Rules of Hooks (otherwise React #310 fires when the component flips
  // from the bootstrap/login render to the authenticated render).
  useEffect(() => {
    if (!didDefaultDashboard && admin && activeTab === 'overview') {
      setActiveTab('dashboard');
      setDidDefaultDashboard(true);
    }
  }, [admin, activeTab, didDefaultDashboard]);

  const handleQuickAction = useCallback(async (action) => {
    if (action === 'stop-all') {
      try {
        const next = { ...featureFlags, offersPaused: true };
        await api('/control/kill-switch', 'POST', next);
        setFeatureFlags(next);
      } catch (err) { setError(err.message); }
    } else if (action === 'start-sale') {
      setActiveTab('offers');
    } else if (action === 'send-notification') {
      setActiveTab('users');
    }
  }, [featureFlags]);

  // Palette callbacks. Kept separate from `handleQuickAction` because the
  // palette needs to await stop-all-offers (so it can show "Working…" and
  // close on success) and seed the offer composer when the operator typed a
  // discount percent like "50".
  const handlePaletteStopAllOffers = useCallback(async () => {
    const next = { ...featureFlags, offersPaused: true };
    try {
      await api('/control/kill-switch', 'POST', next);
      setFeatureFlags(next);
    } catch (err) { setError(err.message); }
  }, [featureFlags]);

  const handlePaletteStartSale = useCallback((percent) => {
    if (percent != null) {
      setOfferForm((prev) => ({ ...prev, discountPercent: percent }));
    }
    setActiveTab('offers');
  }, []);

  if (bootstrapping) return null;

  if (!authenticated) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/95 p-10 shadow-2xl shadow-slate-900/40">
          <h1 className="text-3xl font-semibold">Operations Console</h1>
          <p className="mt-3 text-slate-300">Restricted security console.</p>

          {error && <p className="mt-5 rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

          {!mfaRequired && (
            <form className="mt-8 space-y-4" onSubmit={handleLogin}>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin email"
                required
              />
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <button
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
                disabled={loading}
                type="submit"
              >
                {loading ? 'Verifying…' : 'Secure Sign In'}
              </button>
            </form>
          )}

          {mfaRequired && (
            <form className="mt-8 space-y-4" onSubmit={handleMfaVerify}>
              <p className="text-sm text-slate-300">
                A 6-digit code has been sent to your admin email. Enter it below.
              </p>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 tracking-widest text-center text-xl"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
              />
              <button
                className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
                disabled={loading || mfaCode.length !== 6}
                type="submit"
              >
                {loading ? 'Authorizing…' : 'Complete Login'}
              </button>
              <button
                className="w-full rounded-2xl border border-cyan-400/50 px-4 py-3 text-sm text-cyan-200 disabled:opacity-50"
                disabled={loading || resendingMfa}
                type="button"
                onClick={handleMfaResend}
              >
                {resendingMfa ? 'Resending…' : 'Resend MFA Code'}
              </button>
              {mfaExpiresInSeconds > 0 && (
                <p className="text-center text-xs text-slate-400">
                  Code expires in about {Math.max(1, Math.floor(mfaExpiresInSeconds / 60))} minute(s).
                </p>
              )}
            </form>
          )}
        </section>
      </main>
    );
  }

  const handleOfferCreate = async (e) => {
    e.preventDefault();
    setOfferSaving(true);
    setError('');
    try {
      const planCodes = offerForm.appliesToPlanCodes
        .split(',').map((s) => s.trim()).filter(Boolean);
      const payload = {
        name: offerForm.name.trim(),
        type: offerForm.type,
        label: offerForm.label.trim(),
        discountPercent: Number(offerForm.discountPercent),
        startsAt: new Date(offerForm.startsAt).toISOString(),
        endsAt: new Date(offerForm.endsAt).toISOString(),
        appliesToPlanCodes: planCodes,
      };
      if (offerForm.type === 'coupon') payload.couponCode = offerForm.couponCode.trim().toUpperCase();
      if (offerForm.usageLimit) payload.usageLimit = Number(offerForm.usageLimit);
      const res = await api('/offers', 'POST', payload);
      setOffers((prev) => [res.offer, ...prev]);
      setOfferForm({
        name: '', type: 'festival', label: '', discountPercent: 25,
        startsAt: '', endsAt: '', appliesToPlanCodes: '', couponCode: '', usageLimit: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setOfferSaving(false);
    }
  };

  const handleOfferToggle = async (offer) => {
    try {
      const res = await api(`/offers/${offer.id}`, 'PATCH', { enabled: !offer.enabled });
      setOffers((prev) => prev.map((o) => o.id === offer.id ? res.offer : o));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOfferDelete = async (offer) => {
    if (!window.confirm(`Delete offer "${offer.name}"? This cannot be undone.`)) return;
    try {
      await api(`/offers/${offer.id}`, 'DELETE');
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    } catch (err) {
      setError(err.message);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Pricing plan management
  // Returns a draft for the given plan, falling back to the server snapshot.
  // The draft mirrors the PATCH /pricing/plans/:id payload shape: a `pricing`
  // object keyed by billing cycle plus plan-level fields.
  const getPricingDraft = (plan) => {
    if (pricingDrafts[plan._id]) return pricingDrafts[plan._id];
    const pricing = { ...EMPTY_PRICING };
    for (const c of BILLING_CYCLES) {
      const v = plan.pricing?.[c.key];
      pricing[c.key] = (v === undefined || v === null) ? '' : String(v);
    }
    return {
      pricing,
      trialDays: plan.trialDays ?? 0,
      taxPercent: plan.taxPercent ?? 0,
      platformFeePercent: plan.platformFeePercent ?? 0,
      scheduleAt: '',
      applyOnRenewalOnly: plan.nextRenewalPriceOnly !== false,
    };
  };

  const updatePricingDraft = (plan, patch) => {
    setPricingDrafts((prev) => ({
      ...prev,
      [plan._id]: { ...getPricingDraft(plan), ...patch },
    }));
  };

  const updatePricingDraftCycle = (plan, cycle, value) => {
    const draft = getPricingDraft(plan);
    setPricingDrafts((prev) => ({
      ...prev,
      [plan._id]: { ...draft, pricing: { ...draft.pricing, [cycle]: value } },
    }));
  };

  // Build the `pricing` payload from a draft. Empty strings drop the cycle
  // from the plan (matches sanitisePricingPayload on the server).
  const buildPricingPayload = (draftPricing) => {
    const payload = {};
    for (const c of BILLING_CYCLES) {
      const v = draftPricing[c.key];
      if (v === '' || v === null || v === undefined) continue;
      const num = Number(v);
      if (!Number.isFinite(num)) {
        throw new Error(`pricing.${c.key} must be a number`);
      }
      payload[c.key] = num;
    }
    return payload;
  };

  const handlePricingCreate = async (e) => {
    e.preventDefault();
    setPricingCreating(true);
    setError('');
    try {
      const pricingPayload = buildPricingPayload(pricingForm.pricing);
      if (Object.keys(pricingPayload).length === 0) {
        throw new Error('At least one billing cycle price is required');
      }
      const payload = {
        name: pricingForm.name.trim(),
        code: pricingForm.code.trim(),
        description: pricingForm.description.trim(),
        pricing: pricingPayload,
        trialDays: Number(pricingForm.trialDays) || 0,
        taxPercent: Number(pricingForm.taxPercent) || 0,
        platformFeePercent: Number(pricingForm.platformFeePercent) || 0,
        active: !!pricingForm.active,
      };
      const res = await api('/pricing/plans', 'POST', payload);
      setPricingPlans((prev) => [res.plan, ...prev]);
      setPricingForm(EMPTY_PLAN_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setPricingCreating(false);
    }
  };

  // `forceApplyOnRenewalOnly` is an optional override so callers (e.g. the
  // Subscriptions card view) can guarantee the renewal-only flag without
  // relying on a prior async draft state update settling before this runs.
  const handlePricingSave = async (plan, { schedule, forceApplyOnRenewalOnly } = { schedule: false }) => {
    setPricingSavingId(plan._id);
    setError('');
    try {
      const draft = getPricingDraft(plan);
      const pricingPayload = buildPricingPayload(draft.pricing);
      if (Object.keys(pricingPayload).length === 0) {
        throw new Error('At least one billing cycle price is required');
      }
      const payload = {
        pricing: pricingPayload,
        applyOnRenewalOnly: forceApplyOnRenewalOnly !== undefined ? forceApplyOnRenewalOnly : !!draft.applyOnRenewalOnly,
        trialDays: Number(draft.trialDays) || 0,
        taxPercent: Number(draft.taxPercent) || 0,
        platformFeePercent: Number(draft.platformFeePercent) || 0,
      };
      if (schedule) {
        if (!draft.scheduleAt) throw new Error('Pick a date/time to schedule the change');
        const scheduledAt = new Date(draft.scheduleAt);
        if (Number.isNaN(scheduledAt.getTime())) throw new Error('Invalid scheduled date/time');
        if (scheduledAt.getTime() <= Date.now()) throw new Error('Scheduled time must be in the future');
        payload.scheduleAt = scheduledAt.toISOString();
      }
      const res = await api(`/pricing/plans/${plan._id}`, 'PATCH', payload);
      updateItemById(setPricingPlans, plan._id, res.plan);
      // Drop the draft so the UI re-syncs from the server response.
      setPricingDrafts((prev) => {
        const next = { ...prev };
        delete next[plan._id];
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPricingSavingId(null);
    }
  };

  // Plan-level toggle for the `active` flag. Bypasses the draft so admins can
  // flip it inline without first opening the editor.
  const handlePricingToggleActive = async (plan) => {
    setPricingSavingId(plan._id);
    setError('');
    try {
      const res = await api(`/pricing/plans/${plan._id}`, 'PATCH', { active: !plan.active });
      updateItemById(setPricingPlans, plan._id, res.plan);
    } catch (err) {
      setError(err.message);
    } finally {
      setPricingSavingId(null);
    }
  };

  const handlePricingRollback = async (plan) => {
    const target = Number(pricingRollbackTarget[plan._id]);
    if (!Number.isInteger(target) || target < 1 || target >= plan.pricingVersion) {
      setError('Pick a target version older than the current version');
      return;
    }
    if (!window.confirm(`Roll back "${plan.name}" pricing to version ${target}? This creates a new version reverting to the prices in effect at v${target}.`)) return;
    setPricingSavingId(plan._id);
    setError('');
    try {
      const res = await api(`/pricing/plans/${plan._id}/rollback`, 'POST', { targetVersion: target });
      updateItemById(setPricingPlans, plan._id, res.plan);
      setPricingRollbackTarget((prev) => ({ ...prev, [plan._id]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setPricingSavingId(null);
    }
  };

  // Pre-fill the offer form from a template and scroll the user to the form.
  const handleOfferTemplate = (tpl) => {
    // Format a Date as a datetime-local string in the browser's local timezone.
    const toLocal = (d) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const start = new Date(Date.now() + 60_000); // 1 minute from now
    const end   = new Date(start.getTime() + tpl.durationDays * 86_400_000);
    setOfferForm({
      name: tpl.name,
      type: tpl.type,
      label: tpl.label,
      discountPercent: tpl.discountPercent,
      startsAt: toLocal(start),
      endsAt:   toLocal(end),
      appliesToPlanCodes: '',
      couponCode: tpl.couponCode || '',
      usageLimit: '',
    });
  };

  // Bulk-adjust: updates pricingDrafts for all matching plans so that the
  // admin can preview the new prices on each card before saving individually.
  const handleBulkPriceAdjust = (percent, category, cycle) => {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct === 0) return;
    const multiplier = 1 + pct / 100;
    const targets = category === 'all'
      ? pricingPlans
      : pricingPlans.filter((p) => planCategory(p) === category);
    const updates = {};
    for (const plan of targets) {
      const draft = getPricingDraft(plan);
      const cyclesToAdjust = cycle === '_all'
        ? BILLING_CYCLES.map((c) => c.key)
        : [cycle];
      const newPricing = { ...draft.pricing };
      for (const ck of cyclesToAdjust) {
        const v = newPricing[ck];
        if (v !== '' && v != null) {
          const adjusted = Math.round(Number(v) * multiplier);
          newPricing[ck] = String(Math.min(15000, Math.max(0, adjusted)));
        }
      }
      updates[plan._id] = { ...draft, pricing: newPricing };
    }
    setPricingDrafts((prev) => ({ ...prev, ...updates }));
  };

  const TABS = [
    { id: 'dashboard',      label: 'Dashboard',         icon: '◉' },
    { id: 'overview',       label: 'Overview',          icon: '▦' },
    { id: 'users',          label: 'Users',             icon: '◌' },
    { id: 'payments',       label: 'Payments',          icon: '₹' },
    { id: 'subscriptions',  label: 'Subscriptions',     icon: '◈' },
    { id: 'pricing',        label: 'Pricing (Advanced)', icon: '⊞' },
    { id: 'offers',         label: 'Offers',            icon: '✦' },
    { id: 'loads',          label: 'Loads',             icon: '⊟' },
    { id: 'support',        label: 'Support',           icon: '◇' },
    { id: 'gst',            label: 'GST Invoices',      icon: '⊜' },
    { id: 'analytics',      label: 'Analytics',         icon: '⊿' },
    { id: 'flags',          label: 'Feature Flags',     icon: '⚑' },
    { id: 'search',         label: 'Search',            icon: '⌕' },
    { id: 'audit',          label: 'Audit Log',         icon: '⊡' },
    { id: 'retention',      label: 'Retention',         icon: '◎' },
  ];

  // Default landing tab logic and the Quick-Action / Palette callbacks are
  // declared above the `bootstrapping`/`authenticated` early returns to comply
  // with the Rules of Hooks (otherwise React error #310 fires).

  const topBar = ({ isDark }) => (
    <>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
        className={`hidden md:flex w-72 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
          isDark
            ? 'bg-slate-900 border-white/10 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200'
            : 'bg-white border-slate-200 text-slate-500 hover:border-cyan-400 hover:text-slate-700'
        }`}
      >
        <span aria-hidden className="text-base leading-none opacity-70">⌕</span>
        <span className="flex-1 truncate">Search or run a command…</span>
        <kbd className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
          Ctrl K
        </kbd>
      </button>
      <span className={`hidden lg:inline text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
        {admin?.email}
      </span>
      <button type="button" onClick={() => loadDashboard()} disabled={loading}
        className={`rounded-lg px-2.5 py-1.5 text-sm ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
        {loading ? '⟳' : '↻'}
      </button>
      <button type="button" onClick={handleLogoutAll} disabled={loading}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${isDark ? 'text-rose-300 hover:bg-rose-500/10' : 'text-rose-600 hover:bg-rose-50'}`}>
        Logout all
      </button>
    </>
  );

  const rightPanel = () => (
    <div className="space-y-3">
      <div className="rounded-lg border border-current/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Suggestions</p>
        <ul className="mt-2 space-y-2 text-sm">
          {liveOfferCount(offers) === 0 && (
            <li className="rounded bg-current/[0.04] p-2">
              No live offers. Consider scheduling a festival promotion to lift conversions.
            </li>
          )}
          {(analytics?.openFraudAlerts || 0) > 0 && (
            <li className="rounded bg-rose-500/10 p-2 text-rose-400">
              {analytics.openFraudAlerts} fraud alert(s) open — review in Analytics.
            </li>
          )}
          {featureFlags.maintenanceMode && (
            <li className="rounded bg-amber-500/10 p-2 text-amber-400">
              Maintenance mode is on — disable in Feature Flags when ready.
            </li>
          )}
          {(supportTickets.filter((t) => t.status === 'open').length > 5) && (
            <li className="rounded bg-current/[0.04] p-2">
              {supportTickets.filter((t) => t.status === 'open').length} open support tickets.
            </li>
          )}
        </ul>
        <p className="mt-2 text-[10px] opacity-50">
          Heuristics over live data. Predictive AI lands in Phase 4.
        </p>
      </div>
    </div>
  );

  const fab = (
    <button
      type="button"
      onClick={() => setActiveTab('offers')}
      title="Create offer"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-2xl text-slate-950 shadow-xl shadow-cyan-500/30 hover:bg-cyan-400"
    >
      +
    </button>
  );

  return (
    <>
    <AdminShell
      nav={TABS.map((t) => ({ key: t.id, label: t.label, icon: t.icon }))}
      activeKey={activeTab}
      onNavigate={setActiveTab}
      topBar={topBar}
      rightPanel={rightPanel}
      fab={fab}
    >
      {error && <p className="mb-4 rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {featureFlags.maintenanceMode && (
        <div className="mb-4 rounded-2xl bg-red-600/20 border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-200">
          ⚠ MAINTENANCE MODE IS ACTIVE — all user-facing API endpoints are returning 503
        </div>
      )}

      {activeTab === 'dashboard' && (
        <MissionControl
          users={users}
          revenue={revenue}
          loads={loads}
          supportTickets={supportTickets}
          analytics={analytics}
          offers={offers}
          auditLogs={auditLogs}
          featureFlags={featureFlags}
          onQuickAction={handleQuickAction}
        />
      )}

        {activeTab === 'overview' && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Users" value={users.length} />
              <StatCard label="Subscription Revenue" value={`INR ${Math.round(revenue?.subscriptionRevenue || 0)}`} />
              <StatCard label="Successful Payments" value={`INR ${Math.round(revenue?.payments?.success || 0)}`} />
              <StatCard label="Active Loads" value={loads.filter((l) => l.status === 'open' || l.status === 'in-transit').length} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Open Tickets" value={supportTickets.filter((t) => t.status === 'open').length} />
              <StatCard label="GST Invoices" value={gstInvoices.length} />
              <StatCard label="Open Fraud Alerts" value={analytics?.openFraudAlerts ?? '—'} />
              <StatCard label="Platform Status" value={featureFlags.maintenanceMode ? '🔴 Maintenance' : '🟢 Online'} />
            </div>
          </div>
        )}

        {activeTab === 'flags' && (
          <form className="mt-6" onSubmit={handleFeatureFlagsSave}>
            <h2 className="text-lg font-semibold">Platform Feature Flags</h2>
            <p className="mt-1 text-sm text-slate-400">
              Toggle any feature on or off instantly. Changes take effect on the next API request.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_FLAGS.map(({ key, label, description, danger }) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    featureFlags[key]
                      ? danger ? 'border-red-500/60 bg-red-600/10' : 'border-amber-400/60 bg-amber-500/10'
                      : 'border-white/10 bg-slate-900/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded"
                    checked={Boolean(featureFlags[key])}
                    onChange={(e) => setFeatureFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <div>
                    <p className={`font-medium ${danger && featureFlags[key] ? 'text-red-300' : ''}`}>{label}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{description}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <button className="rounded-xl bg-amber-400 px-6 py-2.5 font-semibold text-slate-900 disabled:opacity-50" disabled={loading} type="submit">
                {loading ? 'Saving…' : 'Apply Feature Flags'}
              </button>
              <p className="text-xs text-slate-400">All changes are audit-logged with your IP address.</p>
            </div>
          </form>
        )}

        {activeTab === 'users' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Users ({users.length})</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2 pr-4">Email</th>
                    <th className="pr-4">Role</th>
                    <th className="pr-4">Status</th>
                    <th className="pr-4">KYC</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const uState = userAction[user._id] || {};
                    return (
                      <tr key={user._id} className="border-t border-white/10">
                        <td className="py-2 pr-4 font-mono text-xs">{user.email}</td>
                        <td className="pr-4">{user.role}</td>
                        <td className="pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.accountStatus === 'suspended' || user.accountStatus === 'blocked'
                              ? 'bg-rose-600/30 text-rose-300'
                              : 'bg-emerald-600/30 text-emerald-300'
                          }`}>
                            {user.accountStatus || 'active'}
                          </span>
                        </td>
                        <td className="pr-4 text-xs text-slate-400">{user.kycStatus || 'pending'}</td>
                        <td className="py-1">
                          <div className="flex flex-wrap gap-1">
                            <select
                              className="rounded-lg bg-slate-800 px-2 py-1 text-xs disabled:opacity-50"
                              value={user.accountStatus || 'active'}
                              disabled={uState.loading}
                              onChange={(e) => handleUserStatus(user._id, e.target.value)}
                            >
                              {['active', 'suspended', 'blocked', 'deleted'].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <select
                              className="rounded-lg bg-slate-800 px-2 py-1 text-xs disabled:opacity-50"
                              value={user.kycStatus || 'pending'}
                              disabled={uState.loading}
                              onChange={(e) => handleUserKyc(user._id, e.target.value)}
                            >
                              {['pending', 'approved', 'rejected'].map((s) => (
                                <option key={s} value={s}>KYC: {s}</option>
                              ))}
                            </select>
                          </div>
                          {uState.error && <p className="mt-1 text-xs text-rose-400">{uState.error}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'loads' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Loads ({loads.length})</h2>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-2 pr-4">Load ID</th><th className="pr-4">Origin</th><th className="pr-4">Destination</th><th className="pr-4">Status</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load._id} className="border-t border-white/10">
                      <td className="py-2 pr-4 font-mono text-xs">{load.loadId || load._id}</td>
                      <td className="pr-4 text-xs">{load.origin}</td>
                      <td className="pr-4 text-xs">{load.destination}</td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${load.status === 'open' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                          {load.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400">{new Date(load.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Payments ({payments.length})</h2>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-2 pr-4">ID</th><th className="pr-4">User</th><th className="pr-4">Amount</th><th className="pr-4">Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="border-t border-white/10">
                      <td className="py-2 pr-4 font-mono text-xs">{p._id}</td>
                      <td className="pr-4 text-xs">{p.userId || '—'}</td>
                      <td className="pr-4">INR {p.amount || 0}</td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === 'captured' ? 'bg-emerald-600/30 text-emerald-300' : p.status === 'failed' ? 'bg-rose-600/30 text-rose-300' : 'bg-slate-700 text-slate-300'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'support' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Support Tickets ({supportTickets.length})</h2>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-2 pr-4">Ticket #</th><th className="pr-4">Subject</th><th className="pr-4">Email</th><th className="pr-4">Priority</th><th className="pr-4">Status</th><th>Change Status</th></tr>
                </thead>
                <tbody>
                  {supportTickets.map((ticket) => (
                    <tr key={ticket._id} className="border-t border-white/10">
                      <td className="py-2 pr-4 font-mono text-xs">{ticket.ticketNumber}</td>
                      <td className="pr-4 max-w-[12rem] truncate text-xs">{ticket.subject}</td>
                      <td className="pr-4 text-xs">{ticket.email}</td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ticket.priority === 'critical' ? 'bg-red-600/40 text-red-300' : ticket.priority === 'high' ? 'bg-orange-600/30 text-orange-300' : 'bg-slate-700 text-slate-300'}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ticket.status === 'open' ? 'bg-cyan-600/30 text-cyan-300' : ticket.status === 'resolved' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="py-1">
                        <select
                          className="rounded-lg bg-slate-800 px-2 py-1 text-xs"
                          value={ticket.status}
                          onChange={(e) => handleTicketStatus(ticket._id, e.target.value)}
                        >
                          {['open', 'in-progress', 'resolved', 'closed'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'gst' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">GST Invoices ({gstInvoices.length})</h2>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-2 pr-4">Invoice #</th><th className="pr-4">Shipper</th><th className="pr-4">Value</th><th className="pr-4">GSTIN</th><th className="pr-4">Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {gstInvoices.map((inv) => (
                    <tr key={inv._id} className="border-t border-white/10">
                      <td className="py-2 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="pr-4 max-w-[10rem] truncate text-xs">{inv.shipper}</td>
                      <td className="pr-4">INR {inv.value || 0}</td>
                      <td className="pr-4 text-xs">{inv.shipperGstin || '—'}</td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${inv.status === 'paid' ? 'bg-emerald-600/30 text-emerald-300' : inv.status === 'cancelled' ? 'bg-rose-600/30 text-rose-300' : 'bg-slate-700 text-slate-300'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400">{inv.date ? new Date(inv.date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="mt-6 space-y-6">
            <h2 className="text-lg font-semibold">Analytics</h2>
            {analytics && (
              <>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Users by Role</h3>
                  <div className="flex flex-wrap gap-3">
                    {(analytics.usersByRole || []).map((r) => (
                      <div key={r._id} className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2">
                        <p className="text-xs text-slate-400">{r._id}</p>
                        <p className="text-xl font-semibold">{r.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Load Status Breakdown</h3>
                  <div className="flex flex-wrap gap-3">
                    {(analytics.loadStatus || []).map((r) => (
                      <div key={r._id} className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2">
                        <p className="text-xs text-slate-400">{r._id}</p>
                        <p className="text-xl font-semibold">{r.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Top Routes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-slate-400">
                        <tr><th className="py-1 pr-4">Origin</th><th className="pr-4">Destination</th><th className="pr-4">Trips</th><th>Freight (INR)</th></tr>
                      </thead>
                      <tbody>
                        {(analytics.topRoutes || []).slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-white/10">
                            <td className="py-1 pr-4 text-xs">{r._id?.origin || '—'}</td>
                            <td className="pr-4 text-xs">{r._id?.destination || '—'}</td>
                            <td className="pr-4">{r.trips}</td>
                            <td>{Math.round(r.freight || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <>
            <SubscriptionIntelligenceDashboard
              plans={pricingPlans}
              onBulkAdjust={handleBulkPriceAdjust}
            />
            <SubscriptionPlansControl
            pricingPlans={pricingPlans}
            pricingSavingId={pricingSavingId}
            getPricingDraft={getPricingDraft}
            updatePricingDraftCycle={updatePricingDraftCycle}
            updatePricingDraft={updatePricingDraft}
            handlePricingSave={handlePricingSave}
            handlePricingToggleActive={handlePricingToggleActive}
            handlePricingDelete={async (plan) => {
              if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
              setPricingSavingId(plan._id);
              setError('');
              try {
                await api(`/pricing/plans/${plan._id}`, 'DELETE');
                setPricingPlans((prev) => prev.filter((p) => p._id !== plan._id));
              } catch (err) {
                setError(err.message);
              } finally {
                setPricingSavingId(null);
              }
            }}
          />
          </>
        )}

        {activeTab === 'pricing' && (
          <div className="mt-6 space-y-6">
            <form onSubmit={handlePricingCreate} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <h3 className="text-base font-semibold">Create Pricing Plan</h3>
              <p className="mt-1 text-xs text-slate-400">
                Set a price for any subset of billing cycles. Cycles left blank are not offered to subscribers. Prices are stored as INR (0 – 15000).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs">Name
                  <input required maxLength={120} value={pricingForm.name}
                    onChange={(e) => setPricingForm((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="Growth" />
                </label>
                <label className="text-xs">Code
                  <input required maxLength={50} value={pricingForm.code}
                    onChange={(e) => setPricingForm((p) => ({ ...p, code: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="growth" />
                </label>
                <label className="text-xs sm:col-span-2 lg:col-span-1">Description
                  <input maxLength={240} value={pricingForm.description}
                    onChange={(e) => setPricingForm((p) => ({ ...p, description: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="Best for growing fleets" />
                </label>
                {BILLING_CYCLES.map((c) => (
                  <label key={c.key} className="text-xs">{c.label} (₹)
                    <input type="number" min={0} max={15000} step="0.01" value={pricingForm.pricing[c.key]}
                      onChange={(e) => setPricingForm((p) => ({ ...p, pricing: { ...p.pricing, [c.key]: e.target.value } }))}
                      className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="—" />
                  </label>
                ))}
                <label className="text-xs">Trial days
                  <input type="number" min={0} max={365} value={pricingForm.trialDays}
                    onChange={(e) => setPricingForm((p) => ({ ...p, trialDays: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">Tax %
                  <input type="number" min={0} max={100} step="0.01" value={pricingForm.taxPercent}
                    onChange={(e) => setPricingForm((p) => ({ ...p, taxPercent: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">Platform fee %
                  <input type="number" min={0} max={100} step="0.01" value={pricingForm.platformFeePercent}
                    onChange={(e) => setPricingForm((p) => ({ ...p, platformFeePercent: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs flex items-center gap-2 mt-5">
                  <input type="checkbox" checked={pricingForm.active}
                    onChange={(e) => setPricingForm((p) => ({ ...p, active: e.target.checked }))} />
                  Active on launch
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button disabled={pricingCreating} className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
                  {pricingCreating ? 'Creating…' : 'Create Plan'}
                </button>
                <p className="text-xs text-slate-400">All pricing mutations are audit-logged.</p>
              </div>
            </form>

            <div>
              <h3 className="text-base font-semibold">Plans ({pricingPlans.length})</h3>
              {pricingPlans.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">No pricing plans yet. Create one above.</p>
              )}
              <div className="mt-3 space-y-4">
                {pricingPlans.map((plan) => {
                  const draft = getPricingDraft(plan);
                  const saving = pricingSavingId === plan._id;
                  const pending = plan.pendingPriceChange && plan.pendingPriceChange.effectiveFrom
                    ? plan.pendingPriceChange : null;
                  const history = Array.isArray(plan.priceHistory) ? plan.priceHistory : [];
                  const trackedVersions = Array.from(new Set(
                    history
                      .map((h) => h.pricingVersionAtChange)
                      .filter((v) => Number.isInteger(v) && v < plan.pricingVersion)
                  )).sort((a, b) => b - a);

                  return (
                    <div key={plan._id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold">{plan.name}</h4>
                            <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{plan.code}</code>
                            <span className={`rounded px-2 py-0.5 text-xs ${plan.active ? 'bg-emerald-700/40 text-emerald-200' : 'bg-slate-700 text-slate-400'}`}>
                              {plan.active ? 'active' : 'inactive'}
                            </span>
                            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">v{plan.pricingVersion}</span>
                          </div>
                          {plan.description && <p className="mt-1 text-xs text-slate-400">{plan.description}</p>}
                        </div>
                        <button onClick={() => handlePricingToggleActive(plan)} disabled={saving}
                          className="rounded bg-slate-700 px-3 py-1 text-xs disabled:opacity-50">
                          {plan.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>

                      {pending && (
                        <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-600/10 px-3 py-2 text-xs text-sky-200">
                          Pending price change effective {new Date(pending.effectiveFrom).toLocaleString()}
                          {pending.applyOnRenewalOnly ? ' — applies on renewal only' : ' — applies immediately at effective time'}.
                        </div>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {BILLING_CYCLES.map((c) => (
                          <label key={c.key} className="text-xs">{c.label} (₹)
                            <input type="number" min={0} max={15000} step="0.01" value={draft.pricing[c.key]}
                              onChange={(e) => updatePricingDraftCycle(plan, c.key, e.target.value)}
                              className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="—" />
                          </label>
                        ))}
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs">Trial days
                          <input type="number" min={0} max={365} value={draft.trialDays}
                            onChange={(e) => updatePricingDraft(plan, { trialDays: e.target.value })}
                            className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs">Tax %
                          <input type="number" min={0} max={100} step="0.01" value={draft.taxPercent}
                            onChange={(e) => updatePricingDraft(plan, { taxPercent: e.target.value })}
                            className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs">Platform fee %
                          <input type="number" min={0} max={100} step="0.01" value={draft.platformFeePercent}
                            onChange={(e) => updatePricingDraft(plan, { platformFeePercent: e.target.value })}
                            className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs">Schedule at (optional)
                          <input type="datetime-local" value={draft.scheduleAt}
                            onChange={(e) => updatePricingDraft(plan, { scheduleAt: e.target.value })}
                            className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="text-xs flex items-center gap-2">
                          <input type="checkbox" checked={!!draft.applyOnRenewalOnly}
                            onChange={(e) => updatePricingDraft(plan, { applyOnRenewalOnly: e.target.checked })} />
                          Apply on renewal only
                        </label>
                        <button type="button" onClick={() => handlePricingSave(plan, { schedule: false })} disabled={saving}
                          className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
                          {saving ? 'Saving…' : 'Save now'}
                        </button>
                        <button type="button" onClick={() => handlePricingSave(plan, { schedule: true })} disabled={saving || !draft.scheduleAt}
                          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
                          {saving ? 'Saving…' : 'Schedule change'}
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
                        <label className="text-xs">Roll back to version
                          <select value={pricingRollbackTarget[plan._id] || ''}
                            onChange={(e) => setPricingRollbackTarget((prev) => ({ ...prev, [plan._id]: e.target.value }))}
                            className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm">
                            <option value="">—</option>
                            {trackedVersions.map((v) => (
                              <option key={v} value={v}>v{v}</option>
                            ))}
                          </select>
                        </label>
                        <button type="button" onClick={() => handlePricingRollback(plan)}
                          disabled={saving || !pricingRollbackTarget[plan._id] || trackedVersions.length === 0}
                          className="rounded-xl bg-rose-600/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          Roll back
                        </button>
                        {trackedVersions.length === 0 && (
                          <span className="text-xs text-slate-500">No tracked prior versions yet.</span>
                        )}
                      </div>

                      {history.length > 0 && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-xs text-slate-300">Price history ({history.length})</summary>
                          <div className="mt-2 max-h-64 overflow-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-slate-400">
                                <tr>
                                  <th className="py-1 pr-3">When</th>
                                  <th className="pr-3">Cycle</th>
                                  <th className="pr-3">Old → New</th>
                                  <th className="pr-3">Type</th>
                                  <th className="pr-3">v</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...history]
                                  .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))
                                  .map((h, i) => (
                                  <tr key={i} className="border-t border-white/10">
                                    <td className="py-1 pr-3 text-slate-400">{new Date(h.effectiveFrom).toLocaleString()}</td>
                                    <td className="pr-3">{h.billingCycle}</td>
                                    <td className="pr-3 font-mono">₹{h.oldPrice} → ₹{h.newPrice}</td>
                                    <td className="pr-3">{h.changeType}{h.rollbackFromVersion != null ? ` (from v${h.rollbackFromVersion})` : ''}</td>
                                    <td className="pr-3 font-mono">{h.pricingVersionAtChange ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="mt-6 space-y-6">
            {featureFlags.offersPaused && (
              <div className="rounded-2xl border border-red-500/50 bg-red-600/15 px-4 py-3 text-sm font-semibold text-red-200">
                ⚠ STOP-ALL-OFFERS is ACTIVE — every active offer is currently inert. Disable the flag in "Feature Flags" to restore.
              </div>
            )}

            {/* ── Quick-launch templates ──────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">⚡ Quick Launch Templates</p>
              <p className="text-xs text-slate-400 mb-3">Click a template to pre-fill the form below — adjust dates or discount % before saving.</p>
              <div className="flex flex-wrap gap-2">
                {OFFER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => handleOfferTemplate(tpl)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-orange-300"
                  >
                    {tpl.label} · {tpl.discountPercent}% · {tpl.durationDays}d
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleOfferCreate} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <h3 className="text-base font-semibold">Create Offer</h3>
              <p className="mt-1 text-xs text-slate-400">
                Festival/flat offers apply automatically when active. Coupons require the user to enter the code at checkout.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs">Name
                  <input required maxLength={120} value={offerForm.name}
                    onChange={(e) => setOfferForm((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="Diwali Sale" />
                </label>
                <label className="text-xs">Type
                  <select value={offerForm.type}
                    onChange={(e) => setOfferForm((p) => ({ ...p, type: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm">
                    <option value="festival">Festival</option>
                    <option value="flat">Flat</option>
                    <option value="coupon">Coupon</option>
                  </select>
                </label>
                <label className="text-xs">Label (banner text)
                  <input maxLength={80} value={offerForm.label}
                    onChange={(e) => setOfferForm((p) => ({ ...p, label: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="Limited Time Offer" />
                </label>
                <label className="text-xs">Discount %
                  <input type="number" min={1} max={90} required value={offerForm.discountPercent}
                    onChange={(e) => setOfferForm((p) => ({ ...p, discountPercent: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">Starts at
                  <input type="datetime-local" required value={offerForm.startsAt}
                    onChange={(e) => setOfferForm((p) => ({ ...p, startsAt: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">Ends at
                  <input type="datetime-local" required value={offerForm.endsAt}
                    onChange={(e) => setOfferForm((p) => ({ ...p, endsAt: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">Applies to plan codes (comma-separated; blank = all)
                  <input value={offerForm.appliesToPlanCodes}
                    onChange={(e) => setOfferForm((p) => ({ ...p, appliesToPlanCodes: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="basic, growth" />
                </label>
                {offerForm.type === 'coupon' && (
                  <label className="text-xs">Coupon code
                    <input required pattern="[A-Za-z0-9_-]{2,50}" maxLength={50} value={offerForm.couponCode}
                      onChange={(e) => setOfferForm((p) => ({ ...p, couponCode: e.target.value.toUpperCase() }))}
                      className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="DIWALI50" />
                  </label>
                )}
                <label className="text-xs">Usage limit (optional)
                  <input type="number" min={1} value={offerForm.usageLimit}
                    onChange={(e) => setOfferForm((p) => ({ ...p, usageLimit: e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm" placeholder="e.g. 1000" />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button disabled={offerSaving} className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
                  {offerSaving ? 'Saving…' : 'Create Offer'}
                </button>
                <p className="text-xs text-slate-400">All offer mutations are audit-logged.</p>
              </div>
            </form>

            <div>
              <h3 className="text-base font-semibold">Active &amp; Past Offers ({offers.length})</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2 pr-4">Name</th>
                      <th className="pr-4">Type</th>
                      <th className="pr-4">Discount</th>
                      <th className="pr-4">Window</th>
                      <th className="pr-4">Plans</th>
                      <th className="pr-4">Coupon</th>
                      <th className="pr-4">Usage</th>
                      <th className="pr-4">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {offers.length === 0 && (
                      <tr><td colSpan="9" className="py-4 text-center text-slate-500">No offers yet.</td></tr>
                    )}
                    {offers.map((offer) => {
                      const now = Date.now();
                      const expired = new Date(offer.endsAt).getTime() <= now;
                      const upcoming = new Date(offer.startsAt).getTime() > now;
                      const live = offer.enabled && !expired && !upcoming;
                      return (
                        <tr key={offer.id} className="border-t border-white/10 align-top">
                          <td className="py-2 pr-4">{offer.name}{offer.label ? <div className="text-xs text-slate-400">{offer.label}</div> : null}</td>
                          <td className="pr-4 text-xs">{offer.type}</td>
                          <td className="pr-4 font-mono text-xs">{offer.discountPercent}%</td>
                          <td className="pr-4 text-xs text-slate-400">
                            {new Date(offer.startsAt).toLocaleString()}
                            <div>→ {new Date(offer.endsAt).toLocaleString()}</div>
                          </td>
                          <td className="pr-4 text-xs">{offer.appliesToPlanCodes?.length ? offer.appliesToPlanCodes.join(', ') : 'ALL'}</td>
                          <td className="pr-4 font-mono text-xs">{offer.couponCode || '—'}</td>
                          <td className="pr-4 text-xs">{offer.usageCount}{offer.usageLimit ? ` / ${offer.usageLimit}` : ''}</td>
                          <td className="pr-4 text-xs">
                            {!offer.enabled && <span className="text-slate-500">disabled</span>}
                            {offer.enabled && expired && <span className="text-rose-300">expired</span>}
                            {offer.enabled && upcoming && <span className="text-sky-300">scheduled</span>}
                            {live && <span className="text-emerald-300">live</span>}
                          </td>
                          <td className="flex gap-2">
                            <button onClick={() => handleOfferToggle(offer)} className="rounded bg-slate-700 px-2 py-1 text-xs">
                              {offer.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={() => handleOfferDelete(offer)} className="rounded bg-rose-600/80 px-2 py-1 text-xs">
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && <AdminSearchPanel />}

        {activeTab === 'audit' && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Audit Log (last 50 admin actions)</h2>
            <div className="mt-3 max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-2 pr-4">Time</th><th className="pr-4">Action</th><th className="pr-4">Resource</th><th className="pr-4">IP</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="border-t border-white/10">
                      <td className="py-2 pr-4 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="pr-4 font-mono text-xs">{log.action}</td>
                      <td className="pr-4 text-xs">{log.resource}{log.resourceId ? ` (${String(log.resourceId).slice(-6)})` : ''}</td>
                      <td className="pr-4 text-xs text-slate-400">{log.ipAddress || '—'}</td>
                      <td className={`text-xs ${log.statusCode >= 400 ? 'text-rose-400' : 'text-emerald-400'}`}>{log.statusCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'retention' && (
          <RetentionDashboard plans={pricingPlans} />
        )}

    </AdminShell>
    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      // Mirror the theme key AdminShell persists so the palette matches even
      // before the user toggles theme this session.
      isDark={(typeof window !== 'undefined' ? window.localStorage.getItem('admin.shell.theme') : 'dark') !== 'light'}
      nav={TABS.map((t) => ({ key: t.id, label: t.label, icon: t.icon }))}
      users={users}
      offers={offers}
      plans={pricingPlans}
      auditLogs={auditLogs}
      onNavigate={setActiveTab}
      onStopAllOffers={handlePaletteStopAllOffers}
      onStartSale={handlePaletteStartSale}
    />
    </>
  );
}

function liveOfferCount(offers) {
  const now = Date.now();
  return (offers || []).filter((o) => o.enabled
    && new Date(o.startsAt).getTime() <= now
    && new Date(o.endsAt).getTime() > now).length;
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Subscription Plans Control — card-based admin view of plans.
// Price changes are always applied on next renewal only (the
// applyOnRenewalOnly flag is forced to true so no existing
// subscription is retroactively repriced).
// ─────────────────────────────────────────────────────────────────

// All billing cycles available in the tab bar. The first 7 map directly to
// priced cycles in the schema. "_trial" and "_free" are special-purpose tabs:
//   _trial  → edits the plan's trialDays field (pre-set to 15)
//   _free   → shows which cycles currently have a ₹0 price
const SUB_CYCLES = [
  { key: 'daily',      label: 'Daily',        isSpecial: false },
  { key: 'weekly',     label: 'Weekly',       isSpecial: false },
  { key: 'fifteenDay', label: '15-day',       isSpecial: false },
  { key: 'monthly',    label: 'Monthly',      isSpecial: false },
  { key: 'quarterly',  label: 'Quarterly',    isSpecial: false },
  { key: 'halfYearly', label: '6-month',      isSpecial: false },
  { key: 'yearly',     label: '1-year',       isSpecial: false },
  { key: '_trial',     label: '15-day Trial', isSpecial: true  },
  { key: '_free',      label: 'Free',         isSpecial: true  },
];

// Maps a plan's code/name to a category key used in the filter tabs.
function planCategory(plan) {
  const str = `${plan.code} ${plan.name}`.toLowerCase();
  if (str.includes('starter') || str.includes('basic')) return 'starter';
  if (str.includes('growth'))                            return 'growth';
  if (str.includes('enterprise'))                        return 'enterprise';
  return 'other';
}

function SubscriptionPlansControl({
  pricingPlans,
  pricingSavingId,
  getPricingDraft,
  updatePricingDraftCycle,
  updatePricingDraft,
  handlePricingSave,
  handlePricingToggleActive,
  handlePricingDelete,
}) {
  // Which plan-category tab is active (null = All)
  const [categoryFilter, setCategoryFilter] = useState(null);
  // Active billing-cycle tab per plan, keyed by plan._id
  const [cycleTabByPlan, setCycleTabByPlan] = useState({});

  // Derive which category tabs actually have matching plans.
  const categoryTabs = ['starter', 'growth', 'enterprise', 'other'].filter(
    (cat) => pricingPlans.some((p) => planCategory(p) === cat)
  );

  const visiblePlans = categoryFilter
    ? pricingPlans.filter((p) => planCategory(p) === categoryFilter)
    : pricingPlans;

  function getActiveCycle(planId) {
    return cycleTabByPlan[planId] || 'monthly';
  }

  function setActiveCycle(planId, cycleKey) {
    setCycleTabByPlan((prev) => ({ ...prev, [planId]: cycleKey }));
  }

  if (pricingPlans.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold">Subscription Plans</h2>
        <p className="mt-3 text-sm text-slate-500">
          No plans yet. Go to the <strong>Pricing (Advanced)</strong> tab to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Payments</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Subscription Plan Control</h2>
        <p className="mt-2 text-sm text-slate-400">
          Edit plan prices per billing cycle. Changes are shown to all users immediately but only
          charged from their{' '}
          <span className="font-medium text-amber-300">next renewal payment</span> — existing
          active subscriptions are never retroactively repriced.
        </p>
      </div>

      {/* Renewal-only banner */}
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        ℹ Price changes take effect from the subscriber's <strong>next recharge / renewal</strong>.
        No currently active subscription price is changed.
      </div>

      {/* ── Plan-category filter tabs ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            categoryFilter === null
              ? 'bg-orange-500 text-slate-950'
              : 'border border-white/15 text-slate-300 hover:border-orange-400/50 hover:text-orange-300'
          }`}
        >
          All ({pricingPlans.length})
        </button>
        {categoryTabs.map((cat) => {
          const count = pricingPlans.filter((p) => planCategory(p) === cat).length;
          const label = cat.charAt(0).toUpperCase() + cat.slice(1);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                categoryFilter === cat
                  ? 'bg-orange-500 text-slate-950'
                  : 'border border-white/15 text-slate-300 hover:border-orange-400/50 hover:text-orange-300'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Plan cards ───────────────────────────────────────────────── */}
      {visiblePlans.length === 0 && (
        <p className="text-sm text-slate-500">No plans in this category yet.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePlans.map((plan) => {
          const draft       = getPricingDraft(plan);
          const saving      = pricingSavingId === plan._id;
          const pending     = plan.pendingPriceChange?.effectiveFrom ? plan.pendingPriceChange : null;
          const activeCycle = getActiveCycle(plan._id);
          const cycleInfo   = SUB_CYCLES.find((c) => c.key === activeCycle) || SUB_CYCLES[3];

          // Current draft value for the selected cycle (price or trialDays for trial tab)
          const currentValue = activeCycle === '_trial'
            ? draft.trialDays
            : activeCycle === '_free'
            ? null
            : draft.pricing[activeCycle];

          // Free cycles are those with price explicitly set to 0
          const freeCycles = SUB_CYCLES.filter(
            (c) => !c.isSpecial && draft.pricing[c.key] !== '' && Number(draft.pricing[c.key]) === 0
          ).map((c) => c.label);

          return (
            <div
              key={plan._id}
              className={`relative flex flex-col rounded-2xl border bg-slate-900/80 p-5 transition-colors ${
                plan.active ? 'border-white/15' : 'border-white/5 opacity-60'
              }`}
            >
              {/* Status badge */}
              <span
                className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  plan.active ? 'bg-emerald-700/40 text-emerald-200' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {plan.active ? 'Active' : 'Inactive'}
              </span>

              {/* Plan name & code */}
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-300">{plan.code}</p>
              <h3 className="mt-0.5 text-lg font-bold text-white">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-[11px] text-slate-400">{plan.description}</p>
              )}

              {/* ── Billing cycle tabs ──────────────────────────────── */}
              <div className="mt-4 flex flex-wrap gap-1">
                {SUB_CYCLES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveCycle(plan._id, c.key)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      activeCycle === c.key
                        ? c.key === '_trial'
                          ? 'bg-sky-500 text-slate-950'
                          : c.key === '_free'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-orange-500 text-slate-950'
                        : 'border border-white/10 text-slate-400 hover:border-orange-400/40 hover:text-orange-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* ── Price / Trial editor for active cycle ────────────── */}
              <div className="mt-4">
                {activeCycle === '_trial' ? (
                  <label className="text-xs text-slate-300">
                    <span className="mb-1 block text-sky-300 font-medium">
                      Free trial period (days)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={draft.trialDays}
                      onChange={(e) => updatePricingDraft(plan, { trialDays: e.target.value })}
                      placeholder="15"
                      className="w-full rounded-lg bg-slate-950 px-3 py-2 text-base font-semibold text-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="mt-1 block text-[10px] text-slate-500">
                      Set to 0 to disable the free trial for this plan.
                    </span>
                  </label>
                ) : activeCycle === '_free' ? (
                  <div className="text-xs text-slate-400">
                    <p className="font-medium text-emerald-300">Free (₹0) cycles</p>
                    {freeCycles.length > 0 ? (
                      <p className="mt-1 text-slate-300">{freeCycles.join(', ')}</p>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        No cycles set to ₹0. Select a cycle tab and set its price to 0 to offer a free tier.
                      </p>
                    )}
                  </div>
                ) : (
                  <label className="text-xs text-slate-300">
                    <span className="mb-1 block text-orange-300 font-medium">
                      {cycleInfo.label} price (₹)
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-400">₹</span>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        step="1"
                        value={currentValue ?? ''}
                        onChange={(e) => updatePricingDraftCycle(plan, activeCycle, e.target.value)}
                        placeholder="—"
                        className="w-full rounded-lg bg-slate-950 px-3 py-2 text-xl font-semibold text-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                        aria-label={`${cycleInfo.label} price (₹)`}
                      />
                    </div>
                    {currentValue === '' && (
                      <span className="mt-1 block text-[10px] text-slate-500">
                        Leave blank to not offer this billing cycle.
                      </span>
                    )}
                  </label>
                )}
              </div>

              {/* Feature list */}
              {Array.isArray(plan.featureMapping) && plan.featureMapping.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
                  {plan.featureMapping.slice(0, 4).map((f) => (
                    <li
                      key={f.key}
                      className={`text-[11px] ${f.enabled ? 'text-slate-300' : 'text-slate-600 line-through'}`}
                    >
                      • {f.key}{f.limit != null ? `: ${f.limit}` : ''}
                    </li>
                  ))}
                </ul>
              )}

              {/* Pending change notice */}
              {pending && (
                <p className="mt-3 rounded-lg border border-sky-500/40 bg-sky-600/10 px-2 py-1.5 text-[10px] text-sky-200">
                  Pending change effective {new Date(pending.effectiveFrom).toLocaleString()}
                </p>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving || activeCycle === '_free'}
                  onClick={() =>
                    handlePricingSave(plan, { schedule: false, forceApplyOnRenewalOnly: true })
                  }
                  className="w-full rounded-full bg-orange-500 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handlePricingToggleActive(plan)}
                    className="flex-1 rounded-full border border-white/15 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {plan.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handlePricingDelete(plan)}
                    className="flex-1 rounded-full border border-rose-500/40 py-2 text-xs text-rose-300 hover:bg-rose-600/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-2 text-center text-[9px] text-slate-600">
                v{plan.pricingVersion} · changes apply on next renewal
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Intelligence Dashboard
// Shown at the top of the Subscriptions tab. Provides at-a-glance stats,
// smart pricing gap alerts, and a bulk price-adjust tool.
// ─────────────────────────────────────────────────────────────────────────────
function SubscriptionIntelligenceDashboard({ plans, onBulkAdjust }) {
  const [adjPct,      setAdjPct]      = useState('');
  const [adjCategory, setAdjCategory] = useState('all');
  const [adjCycle,    setAdjCycle]    = useState('monthly');

  const activePlans   = plans.filter((p) => p.active);
  const trialPlans    = plans.filter((p) => (p.trialDays ?? 0) > 0);
  const fullyCovered  = plans.filter((p) =>
    BILLING_CYCLES.every((c) => p.pricing?.[c.key] != null)
  );
  const monthlyRevCap = activePlans.reduce((s, p) => s + (p.pricing?.monthly ?? 0), 0);

  // Smart suggestions derived from plan data
  const suggestions = [];
  const missingMonthly = activePlans.filter((p) => !p.pricing?.monthly);
  if (missingMonthly.length > 0)
    suggestions.push(`${missingMonthly.length} active plan(s) have no monthly price — subscribers can't choose monthly billing.`);
  if (trialPlans.length === 0 && plans.length > 0)
    suggestions.push('No plans offer a free trial. Trials typically boost paid conversions by 30–60%.');
  if (fullyCovered.length < plans.length && plans.length > 0)
    suggestions.push(`${plans.length - fullyCovered.length} plan(s) are missing some billing cycles — add them to reach more subscriber preferences.`);
  if (plans.length > 0 && activePlans.length === 0)
    suggestions.push('All plans are currently inactive — users cannot subscribe to any plan.');
  if (plans.length === 0)
    suggestions.push('No pricing plans yet. Create one in the Pricing (Advanced) tab.');

  const handleApply = () => {
    if (!adjPct || Number(adjPct) === 0) return;
    onBulkAdjust(adjPct, adjCategory, adjCycle);
    setAdjPct('');
  };

  return (
    <div className="mt-6 space-y-5">
      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IntelCard label="Active Plans"    value={activePlans.length}   sub={`${plans.length} total`}          color="emerald" />
        <IntelCard label="Trial Enabled"   value={trialPlans.length}    sub="plans with free trial"            color="sky"     />
        <IntelCard label="Full Coverage"   value={fullyCovered.length}  sub="plans with all cycles priced"    color="violet"  />
        <IntelCard
          label="Monthly Rev Cap"
          value={`₹${monthlyRevCap.toLocaleString('en-IN')}`}
          sub="per subscriber · all active plans"
          color="orange"
        />
      </div>

      {/* ── Smart suggestions ────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-600/10 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">💡 Smart Suggestions</p>
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-sky-200">
                <span className="mt-0.5 text-sky-400">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Bulk price adjust ────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-orange-300">⚡ Bulk Price Adjust</p>
        <p className="mb-4 text-xs text-slate-400">
          Apply a percentage change to draft prices across plan categories in one action. Review each card then save individually.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-300">
            Category
            <select
              value={adjCategory}
              onChange={(e) => setAdjCategory(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Billing cycle
            <select
              value={adjCycle}
              onChange={(e) => setAdjCycle(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="_all">All cycles</option>
              {BILLING_CYCLES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            % change (e.g. +10 or −5)
            <input
              type="number"
              min={-90}
              max={200}
              value={adjPct}
              onChange={(e) => setAdjPct(e.target.value)}
              placeholder="0"
              className="mt-1 w-28 rounded-lg bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </label>
          <button
            type="button"
            onClick={handleApply}
            disabled={!adjPct || Number(adjPct) === 0}
            className="rounded-full bg-orange-500 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-orange-400 disabled:opacity-40"
          >
            Apply to Drafts
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          ⚠ Updates draft values only — use Save on each plan card to persist the change to the server.
        </p>
      </div>
    </div>
  );
}

function IntelCard({ label, value, sub, color = 'orange' }) {
  const styles = {
    orange:  'border-orange-500/25  bg-orange-500/10  text-orange-300',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    sky:     'border-sky-500/25     bg-sky-500/10     text-sky-300',
    violet:  'border-violet-500/25  bg-violet-500/10  text-violet-300',
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[color] || styles.orange}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-[10px] opacity-60">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention Dashboard
// Forward-looking analytics: revenue forecaster, pricing matrix, plan health
// scores, and an AI-ready roadmap panel for features planned through 2040.
// ─────────────────────────────────────────────────────────────────────────────
function RetentionDashboard({ plans }) {
  const [forecasterCounts, setForecasterCounts] = useState({});

  const activePlans = plans.filter((p) => p.active);
  const totalMrr = activePlans.reduce((sum, p) => {
    const subs = Number(forecasterCounts[p._id] || 0);
    return sum + subs * (p.pricing?.monthly ?? 0);
  }, 0);
  const totalArr = totalMrr * 12;

  return (
    <div className="mt-6 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Intelligence</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Retention &amp; Revenue Intelligence</h2>
        <p className="mt-2 text-sm text-slate-400">
          Forward-looking tools to forecast revenue, identify pricing gaps, and track plan health from today through 2040.
        </p>
      </div>

      {/* ── Revenue Forecaster ──────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h3 className="text-base font-semibold text-white">📈 Revenue Forecaster</h3>
        <p className="mt-1 text-xs text-slate-400">
          Enter projected subscriber counts per plan to model Monthly Recurring Revenue (MRR) and Annual Recurring Revenue (ARR).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="py-2 pr-4 text-left">Plan</th>
                <th className="pr-4 text-left">Monthly ₹</th>
                <th className="pr-4 text-left">Yearly ₹</th>
                <th className="pr-4 text-left">Est. Subscribers</th>
                <th className="text-left">Projected MRR</th>
              </tr>
            </thead>
            <tbody>
              {activePlans.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-4 text-center text-slate-500">No active plans yet.</td>
                </tr>
              )}
              {activePlans.map((plan) => {
                const subs = Number(forecasterCounts[plan._id] || 0);
                const mrr  = subs * (plan.pricing?.monthly ?? 0);
                return (
                  <tr key={plan._id} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-medium">{plan.name}</td>
                    <td className="pr-4 text-slate-300">{plan.pricing?.monthly != null ? `₹${plan.pricing.monthly}` : '—'}</td>
                    <td className="pr-4 text-slate-300">{plan.pricing?.yearly  != null ? `₹${plan.pricing.yearly}`  : '—'}</td>
                    <td className="pr-4">
                      <input
                        type="number"
                        min={0}
                        max={1_000_000}
                        value={forecasterCounts[plan._id] || ''}
                        onChange={(e) =>
                          setForecasterCounts((prev) => ({ ...prev, [plan._id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-24 rounded-lg bg-slate-950 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </td>
                    <td className="font-semibold text-orange-300">₹{mrr.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
            {activePlans.length > 0 && (
              <tfoot className="border-t-2 border-orange-500/40">
                <tr>
                  <td colSpan="4" className="py-2 pr-4 text-right text-sm font-semibold text-slate-300">Total MRR</td>
                  <td className="text-lg font-bold text-orange-400">₹{totalMrr.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td colSpan="4" className="py-1 pr-4 text-right text-xs text-slate-400">Projected ARR (MRR × 12)</td>
                  <td className="text-base font-semibold text-orange-300">₹{totalArr.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Pricing Coverage Matrix ──────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h3 className="text-base font-semibold text-white">🗂 Pricing Coverage Matrix</h3>
        <p className="mt-1 text-xs text-slate-400">
          At-a-glance view of every plan × billing cycle. Green = price set, grey = not offered.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="min-w-[8rem] py-2 pr-4 text-left">Plan</th>
                {BILLING_CYCLES.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2 text-center">{c.label}</th>
                ))}
                <th className="px-2 py-2 text-center">Trial</th>
                <th className="px-2 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 && (
                <tr>
                  <td colSpan={BILLING_CYCLES.length + 3} className="py-4 text-center text-slate-500">No plans yet.</td>
                </tr>
              )}
              {plans.map((plan) => (
                <tr key={plan._id} className="border-t border-white/10">
                  <td className="pr-4 py-2 font-medium">{plan.name}</td>
                  {BILLING_CYCLES.map((c) => {
                    const price = plan.pricing?.[c.key];
                    const set   = price !== undefined && price !== null;
                    return (
                      <td key={c.key} className="px-2 py-2 text-center">
                        {set
                          ? <span className="rounded px-1.5 py-0.5 bg-emerald-700/30 text-emerald-300">₹{price}</span>
                          : <span className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-600">—</span>
                        }
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    {(plan.trialDays ?? 0) > 0
                      ? <span className="rounded px-1.5 py-0.5 bg-sky-700/30 text-sky-300">{plan.trialDays}d</span>
                      : <span className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-600">—</span>
                    }
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${plan.active ? 'bg-emerald-700/30 text-emerald-300' : 'bg-slate-700 text-slate-500'}`}>
                      {plan.active ? '● on' : '● off'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Plan Health Scores ────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h3 className="text-base font-semibold text-white">🏥 Plan Health Scores</h3>
        <p className="mt-1 text-xs text-slate-400">
          Each plan is scored on pricing completeness (60 pts), trial coverage (20 pts), and active status (20 pts).
        </p>
        <div className="mt-4 space-y-3">
          {plans.length === 0 && <p className="text-sm text-slate-500">No plans yet.</p>}
          {plans.map((plan) => {
            const cyclesCovered = BILLING_CYCLES.filter((c) => plan.pricing?.[c.key] != null).length;
            const hasTrial      = (plan.trialDays ?? 0) > 0;
            const score         = Math.round(
              (cyclesCovered / BILLING_CYCLES.length) * 60
              + (hasTrial     ? 20 : 0)
              + (plan.active  ? 20 : 0)
            );
            const barColor  = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
            const textColor = score >= 80 ? 'text-emerald-300' : score >= 50 ? 'text-amber-300' : 'text-rose-300';
            const scoreLabel = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs attention';
            return (
              <div key={plan._id} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{plan.name}</span>
                  <span className={`text-xs font-semibold ${textColor}`}>{score}% · {scoreLabel}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800">
                  <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-400">
                  <span>{cyclesCovered}/{BILLING_CYCLES.length} cycles priced</span>
                  <span className={hasTrial ? 'text-sky-300' : 'text-slate-600'}>
                    Trial: {hasTrial ? `${plan.trialDays}d` : 'none'}
                  </span>
                  <span className={plan.active ? 'text-emerald-300' : 'text-rose-400'}>
                    {plan.active ? '● Active' : '● Inactive'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI-Ready Roadmap (2025–2040) ─────────────────────────── */}
      <div className="rounded-2xl border border-violet-500/30 bg-violet-600/10 p-5">
        <h3 className="text-base font-semibold text-violet-200">🤖 AI-Ready Roadmap · 2025 – 2040</h3>
        <p className="mt-2 text-sm text-slate-400">
          Intelligence features on the platform's long-term growth roadmap — building towards fully autonomous subscription management:
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {[
            'Churn prediction: flag subscribers likely to cancel in the next 30 days based on usage patterns',
            'Dynamic pricing engine: auto-adjust daily / weekly rates based on real-time demand signals',
            'Price elasticity modelling: simulate revenue impact of any price change before applying',
            'Cohort retention analysis: track which sign-up cohort retains longest by plan tier',
            'AI-timed offers: suggest the optimal day, discount %, and duration for maximum paid conversions',
            'Subscriber LTV forecasting: lifetime value projection by plan × billing cycle × region',
            'Personalised renewal nudges: auto-generate per-subscriber reminder copy and send via preferred channel',
            'Regional dynamic pricing: automatically apply multipliers for high/low purchasing-power zones',
            'Automated grace-period management: configurable post-expiry access window with usage throttling',
            'Smart plan upgrade prompts: surface upgrade offers to users approaching feature limits',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-violet-400">◈</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-slate-500">
          Items listed are planned features, not yet implemented. Current data feeds into this roadmap as historical training data.
        </p>
      </div>
    </div>
  );
}
