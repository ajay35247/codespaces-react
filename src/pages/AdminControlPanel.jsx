import { useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ADMIN_API_SEGMENT = import.meta.env.VITE_ADMIN_API_SEGMENT || '_ops_console_f91b7c';
const STORAGE_KEY = 'speedy-trucks-admin-auth';

function getStoredAuth() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredAuth(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

async function api(path, method = 'GET', body, token) {
  const response = await fetch(`${API_URL}/api/${ADMIN_API_SEGMENT}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-device-id': 'web-control-panel',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export function AdminControlPanel() {
  const existingAuth = getStoredAuth();
  const [token, setToken] = useState(existingAuth?.token || null);
  const [refreshToken, setRefreshToken] = useState(existingAuth?.refreshToken || null);
  const [admin, setAdmin] = useState(existingAuth?.admin || null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [killSwitch, setKillSwitch] = useState({
    bookingsPaused: false,
    paymentsPaused: false,
    registrationsPaused: false,
  });

  const authenticated = useMemo(() => Boolean(token && admin), [token, admin]);

  const persist = (next) => {
    setStoredAuth(next);
    setToken(next.token);
    setRefreshToken(next.refreshToken);
    setAdmin(next.admin);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/login', 'POST', { email, password });
      setMfaRequired(true);
      setMfaChallengeToken(data.mfaChallengeToken);
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
        email,
        mfaChallengeToken,
        mfaCode,
      });
      persist({ token: data.token, refreshToken: data.refreshToken, admin: data.admin });
      setMfaRequired(false);
      setMfaCode('');
      await loadDashboard(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async (activeToken = token) => {
    if (!activeToken) return;
    setLoading(true);
    setError('');
    try {
      const [usersData, plansData, revenueData, killSwitchData] = await Promise.all([
        api('/control/users?limit=50', 'GET', undefined, activeToken),
        api('/pricing/plans', 'GET', undefined, activeToken),
        api('/revenue/summary', 'GET', undefined, activeToken),
        api('/control/kill-switch', 'GET', undefined, activeToken),
      ]);
      setUsers(usersData.users || []);
      setPricingPlans(plansData.plans || []);
      setRevenue(revenueData);
      setKillSwitch(killSwitchData.value || killSwitch);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/refresh-token', 'POST', { refreshToken });
      persist({ token: data.token, refreshToken: data.refreshToken, admin });
      await loadDashboard(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await api('/auth/logout-all', 'POST', {}, token);
      clearStoredAuth();
      setToken(null);
      setRefreshToken(null);
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

  const handleKillSwitchSave = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/control/kill-switch', 'POST', killSwitch, token);
      setKillSwitch(data.value);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/95 p-8 shadow-2xl shadow-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Control Tower</h1>
            <p className="text-slate-300">Signed in as {admin?.email}</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-xl bg-slate-700 px-4 py-2 text-sm" type="button" onClick={handleRefresh}>Refresh Token</button>
            <button className="rounded-xl bg-rose-500 px-4 py-2 text-sm text-slate-950" type="button" onClick={handleLogoutAll}>Logout All Sessions</button>
          </div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Total Users</p>
            <p className="mt-2 text-3xl font-semibold">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Subscription Revenue</p>
            <p className="mt-2 text-3xl font-semibold">INR {Math.round(revenue?.subscriptionRevenue || 0)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Success Payments</p>
            <p className="mt-2 text-3xl font-semibold">INR {Math.round(revenue?.payments?.success || 0)}</p>
          </div>
        </div>

        <form className="mt-8 rounded-2xl border border-white/10 bg-slate-900/80 p-5" onSubmit={handleKillSwitchSave}>
          <h2 className="text-lg font-semibold">Kill Switch</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={killSwitch.bookingsPaused} onChange={(e) => setKillSwitch({ ...killSwitch, bookingsPaused: e.target.checked })} />Pause bookings</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={killSwitch.paymentsPaused} onChange={(e) => setKillSwitch({ ...killSwitch, paymentsPaused: e.target.checked })} />Pause payments</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={killSwitch.registrationsPaused} onChange={(e) => setKillSwitch({ ...killSwitch, registrationsPaused: e.target.checked })} />Pause registrations</label>
          </div>
          <button className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900" disabled={loading} type="submit">Apply Kill Switch</button>
        </form>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <h2 className="text-lg font-semibold">Users</h2>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400"><tr><th>Email</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item._id} className="border-t border-white/10">
                      <td className="py-2">{item.email}</td>
                      <td>{item.role}</td>
                      <td>{item.accountStatus || 'active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <h2 className="text-lg font-semibold">Pricing Plans</h2>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400"><tr><th>Plan</th><th>Monthly</th><th>Version</th></tr></thead>
                <tbody>
                  {pricingPlans.map((plan) => (
                    <tr key={plan._id} className="border-t border-white/10">
                      <td className="py-2">{plan.name}</td>
                      <td>{plan.pricing?.monthly || 0}</td>
                      <td>{plan.pricingVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <button className="mt-8 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900" type="button" onClick={() => loadDashboard()} disabled={loading}>
          Reload Dashboard Data
        </button>
      </section>
    </main>
  );
}
