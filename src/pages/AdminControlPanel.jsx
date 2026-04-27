import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl, getApiErrorMessage, parseApiBody } from '../utils/api';
import { AdminShell } from '../components/admin/AdminShell';
import { MissionControl } from '../components/admin/MissionControl';

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
  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FLAGS);
  const [activeTab, setActiveTab] = useState('overview');
  const [userAction, setUserAction] = useState({});

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

  const TABS = [
    { id: 'dashboard', label: 'Dashboard',     icon: '◉' },
    { id: 'overview',  label: 'Overview',      icon: '▦' },
    { id: 'users',     label: 'Users',         icon: '◌' },
    { id: 'payments',  label: 'Payments',      icon: '₹' },
    { id: 'offers',    label: 'Offers',        icon: '✦' },
    { id: 'loads',     label: 'Loads',         icon: '⊟' },
    { id: 'support',   label: 'Support',       icon: '◇' },
    { id: 'gst',       label: 'GST Invoices',  icon: '⊜' },
    { id: 'analytics', label: 'Analytics',     icon: '⊿' },
    { id: 'flags',     label: 'Feature Flags', icon: '⚑' },
    { id: 'audit',     label: 'Audit Log',     icon: '⊡' },
  ];

  // Default landing tab is the new mission-control dashboard. Use a ref-style
  // flag (init via useState) so this only runs once per mount; otherwise an
  // admin navigating back to "overview" would be bounced to "dashboard" again.
  const [didDefaultDashboard, setDidDefaultDashboard] = useState(false);
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

  const topBar = ({ isDark }) => (
    <>
      <input
        type="search"
        placeholder="Search users, offers, payments…"
        className={`hidden md:block w-72 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
          isDark ? 'bg-slate-900 border-white/10 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
        }`}
        aria-label="Global search (visual only — Phase 9)"
        disabled
        title="Global search lands in Phase 9"
      />
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

        {activeTab === 'offers' && (
          <div className="mt-6 space-y-6">
            {featureFlags.offersPaused && (
              <div className="rounded-2xl border border-red-500/50 bg-red-600/15 px-4 py-3 text-sm font-semibold text-red-200">
                ⚠ STOP-ALL-OFFERS is ACTIVE — every active offer is currently inert. Disable the flag in "Feature Flags" to restore.
              </div>
            )}

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

    </AdminShell>
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
