import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl, getApiErrorMessage, parseApiBody } from '../utils/api';

const ADMIN_API_SEGMENT = import.meta.env.VITE_ADMIN_API_SEGMENT || import.meta.env.VITE_ADMIN_PRIVATE_PATH_SEGMENT || '_ops_console_f91b7c';

const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

/**
 * All admin-controllable feature flags with display metadata.
 * The `key` must match the field names in the kill-switch document exactly.
 */
const FEATURE_FLAGS = [
  { key: 'maintenanceMode',      label: 'Maintenance Mode',      description: 'Blocks ALL non-admin API endpoints',           danger: true  },
  { key: 'bookingsPaused',       label: 'Pause Bookings',        description: 'Prevents new loads from being created',        danger: false },
  { key: 'paymentsPaused',       label: 'Pause Payments',        description: 'Blocks subscriptions and toll recharges',      danger: false },
  { key: 'registrationsPaused',  label: 'Pause Registrations',   description: 'Prevents new user accounts from being created',danger: false },
  { key: 'trackingPaused',       label: 'Pause Tracking',        description: 'Disables GPS tracking API endpoints',          danger: false },
  { key: 'matchingPaused',       label: 'Pause Load Matching',   description: 'Disables AI/load-matching engine',             danger: false },
  { key: 'gstPaused',            label: 'Pause GST Invoicing',   description: 'Prevents new GST invoices from being created', danger: false },
  { key: 'tollsPaused',          label: 'Pause Tolls',           description: 'Blocks FASTag wallet recharge orders',         danger: false },
  { key: 'fleetPaused',          label: 'Pause Fleet Mgmt',      description: 'Disables all fleet-manager routes',            danger: false },
  { key: 'brokersPaused',        label: 'Pause Brokers',         description: 'Disables all broker routes',                   danger: false },
  { key: 'supportPaused',        label: 'Pause Support',         description: 'Prevents new support ticket submissions',      danger: false },
];

const DEFAULT_FLAGS = Object.fromEntries(FEATURE_FLAGS.map(({ key }) => [key, false]));

/** Maximum number of users fetched from the admin API per dashboard load. */
const USERS_FETCH_LIMIT = 100;

/** Update a single item inside a React state list by its `_id` field. */
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

  // Dashboard data
  const [users, setUsers] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loads, setLoads] = useState([]);
  const [payments, setPayments] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [gstInvoices, setGstInvoices] = useState([]);

  // Feature flags (all 11 fields)
  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FLAGS);

  // Active dashboard tab
  const [activeTab, setActiveTab] = useState('overview');

  // Per-user inline action states
  const [userAction, setUserAction] = useState({}); // { [userId]: { loading, error } }

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
        usersData,
        plansData,
        revenueData,
        flagsData,
        analyticsData,
        auditData,
        loadsData,
        paymentsData,
        ticketsData,
        invoicesData,
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

  // ── Per-user inline actions ─────────────────────────────────────────────────

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

  // ── Login / MFA screens ─────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/95 p-10 shadow-2xl shadow-slate-900/40">
          <h1 className="text-3xl font-semibold">Operations Console</h1>
          <p className="mt-3 text-slate-300">Restricted security console.</p>

          {error && <p className="mt-5 rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

          {!mfaRequired && (
            <form className="mt-8 space-y-4" onSubmit={handleLogin}>
              <input className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" required />
              <input className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
              <button className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={loading} type="submit">{loading ? 'Verifying…' : 'Secure Sign In'}</button>
            </form>
          )}

          {mfaRequired && (
            <form className="mt-8 space-y-4" onSubmit={handleMfaVerify}>
              <input className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3" type="text" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit MFA code" required />
              <button className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={loading || mfaCode.length !== 6} type="submit">{loading ? 'Authorizing…' : 'Complete Login'}</button>
              <button className="w-full rounded-2xl border border-cyan-400/50 px-4 py-3 text-sm text-cyan-200 disabled:opacity-50" disabled={loading || resendingMfa} type="button" onClick={handleMfaResend}>{resendingMfa ? 'Resending…' : 'Resend MFA Code'}</button>
              {mfaExpiresInSeconds > 0 && <p className="text-center text-xs text-slate-400">Code expires in about {Math.max(1, Math.floor(mfaExpiresInSeconds / 60))} minute(s).</p>}
            </form>
          )}
        </section>
      </main>
    );
  }

  // ── Tab navigation helpers ──────────────────────────────────────────────────

  const TABS = [
    { id: 'overview',  label: 'Overview'       },
    { id: 'flags',     label: 'Feature Flags'  },
    { id: 'users',     label: 'Users'          },
    { id: 'loads',     label: 'Loads'          },
    { id: 'payments',  label: 'Payments'       },
    { id: 'support',   label: 'Support'        },
    { id: 'gst',       label: 'GST Invoices'   },
    { id: 'analytics', label: 'Analytics'      },
    { id: 'audit',     label: 'Audit Log'      },
  ];

  // ── Main dashboard ──────────────────────────────────────────────────────────

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/95 p-6 shadow-2xl shadow-slate-900/40">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Control Tower</h1>
            <p className="text-slate-300">Signed in as {admin?.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-xl bg-slate-700 px-4 py-2 text-sm" type="button" onClick={handleRefresh} disabled={loading}>Refresh Token</button>
            <button className="rounded-xl bg-cyan-600 px-4 py-2 text-sm" type="button" onClick={() => loadDashboard()} disabled={loading}>{loading ? 'Loading…' : 'Reload Data'}</button>
            <button className="rounded-xl bg-rose-500 px-4 py-2 text-sm text-slate-950" type="button" onClick={handleLogoutAll} disabled={loading}>Logout All Sessions</button>
          </div>
        </div>

        {/* Maintenance-mode banner */}
        {featureFlags.maintenanceMode && (
          <div className="mt-4 rounded-2xl bg-red-600/30 border border-red-500/50 px-4 py-3 text-sm font-semibold text-red-200">
            ⚠ MAINTENANCE MODE IS ACTIVE — all user-facing API endpoints are returning 503
          </div>
        )}

        {error && <p className="mt-4 rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

        {/* Tab bar */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
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

        {/* ── FEATURE FLAGS TAB ────────────────────────────────────────────── */}
        {activeTab === 'flags' && (
          <form className="mt-6" onSubmit={handleFeatureFlagsSave}>
            <h2 className="text-lg font-semibold">Platform Feature Flags</h2>
            <p className="mt-1 text-sm text-slate-400">
              Toggle any feature on or off instantly. Changes take effect on the next API request (cache is invalidated server-side).
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_FLAGS.map(({ key, label, description, danger }) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    featureFlags[key]
                      ? danger
                        ? 'border-red-500/60 bg-red-600/10'
                        : 'border-amber-400/60 bg-amber-500/10'
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
              <button
                className="rounded-xl bg-amber-400 px-6 py-2.5 font-semibold text-slate-900 disabled:opacity-50"
                disabled={loading}
                type="submit"
              >
                {loading ? 'Saving…' : 'Apply Feature Flags'}
              </button>
              <p className="text-xs text-slate-400">All changes are audit-logged with your IP address.</p>
            </div>
          </form>
        )}

        {/* ── USERS TAB ────────────────────────────────────────────────────── */}
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
                            {/* Account status */}
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
                            {/* KYC status */}
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

        {/* ── LOADS TAB ────────────────────────────────────────────────────── */}
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

        {/* ── PAYMENTS TAB ─────────────────────────────────────────────────── */}
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

        {/* ── SUPPORT TICKETS TAB ──────────────────────────────────────────── */}
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

        {/* ── GST INVOICES TAB ─────────────────────────────────────────────── */}
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

        {/* ── ANALYTICS TAB ────────────────────────────────────────────────── */}
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
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Payment Status Breakdown</h3>
                  <div className="flex flex-wrap gap-3">
                    {(analytics.paymentStatus || []).map((r) => (
                      <div key={r._id} className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2">
                        <p className="text-xs text-slate-400">{r._id}</p>
                        <p className="text-xl font-semibold">{r.count}</p>
                        <p className="text-xs text-slate-500">INR {Math.round(r.amount || 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Top Routes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-slate-400"><tr><th className="py-1 pr-4">Origin</th><th className="pr-4">Destination</th><th className="pr-4">Trips</th><th>Freight (INR)</th></tr></thead>
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

        {/* ── AUDIT LOG TAB ─────────────────────────────────────────────────── */}
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

      </section>
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
