import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { apiRequest } from '../utils/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WalletSetupForm({ existingWallet, onSaved }) {
  const [form, setForm] = useState({
    vehicleNumber: existingWallet?.vehicleNumber || '',
    tagId: existingWallet?.tagId || '',
    bankName: existingWallet?.bankName || '',
    lowBalanceThreshold: existingWallet?.lowBalanceThreshold ?? 200,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        vehicleNumber: form.vehicleNumber.toUpperCase().trim(),
      };
      if (form.tagId.trim()) body.tagId = form.tagId.trim();
      if (form.bankName.trim()) body.bankName = form.bankName.trim();
      body.lowBalanceThreshold = parseInt(form.lowBalanceThreshold, 10) || 200;

      await apiRequest('/tolls/wallet/setup', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Vehicle Number *</label>
        <input
          name="vehicleNumber"
          value={form.vehicleNumber}
          onChange={handleChange}
          placeholder="MH12AB1234"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white uppercase"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">FASTag ID / Tag Number</label>
        <input
          name="tagId"
          value={form.tagId}
          onChange={handleChange}
          placeholder="e.g. HDFC1234567890"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Issuing Bank</label>
        <select
          name="bankName"
          value={form.bankName}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="">Select bank…</option>
          {['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Kotak Bank', 'PayTM Payments Bank', 'IDFC First Bank', 'Yes Bank', 'Karnataka Bank', 'Other'].map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Low Balance Alert (₹)</label>
        <input
          name="lowBalanceThreshold"
          type="number"
          min="0"
          max="10000"
          value={form.lowBalanceThreshold}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {saving ? 'Saving…' : (existingWallet ? 'Update Wallet' : 'Set Up FASTag Wallet')}
        </button>
        {error && <p className="text-sm text-orange-300">{error}</p>}
      </div>
    </form>
  );
}

function RechargeModal({ wallet, user, onRecharged, onClose }) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

  const handleRecharge = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum < 100) {
      setError('Minimum recharge amount is ₹100');
      return;
    }
    setStatus('processing');
    setError(null);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Unable to load Razorpay checkout');

      const data = await apiRequest('/tolls/recharge/order', {
        method: 'POST',
        body: { amount: amountNum },
      });

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Speedy Trucks – FASTag',
        description: `Recharge for ${data.vehicleNumber}`,
        order_id: data.orderId,
        handler: async (response) => {
          try {
            const verifyData = await apiRequest('/tolls/recharge/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            setStatus('success');
            onRecharged(verifyData.newBalance);
          } catch (verifyErr) {
            setStatus('error');
            setError(verifyErr.message);
          }
        },
        prefill: { name: user?.name || '', email: user?.email || '' },
        notes: { vehicleNumber: data.vehicleNumber, purpose: 'FASTag recharge' },
        theme: { color: '#f97316' },
        modal: { ondismiss: () => setStatus(null) },
      };

      const rp = new window.Razorpay(options);
      rp.open();
      setStatus('redirect');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Recharge FASTag</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <p className="mt-2 text-sm text-slate-400">Vehicle: <span className="text-white font-medium">{wallet.vehicleNumber}</span></p>
        <p className="text-sm text-slate-400">Current balance: <span className="text-emerald-400 font-medium">{formatINR(wallet.balance)}</span></p>

        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${amount === String(q) ? 'bg-orange-500 text-slate-950' : 'border border-white/20 text-slate-300 hover:bg-slate-800'}`}
            >
              ₹{q}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-xs text-slate-400 mb-1">Custom amount (₹)</label>
          <input
            type="number"
            min="100"
            max="100000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </div>

        {error && <p className="mt-3 text-sm text-orange-300">{error}</p>}
        {status === 'success' && <p className="mt-3 text-sm text-emerald-300">✓ Recharge successful! Balance updated.</p>}

        <button
          onClick={handleRecharge}
          disabled={status === 'processing' || status === 'redirect' || status === 'success'}
          className="mt-5 w-full rounded-full bg-orange-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {status === 'processing' ? 'Creating order…' : status === 'redirect' ? 'Awaiting payment…' : status === 'success' ? 'Done' : `Pay ${amount ? formatINR(parseInt(amount, 10)) : ''}`}
        </button>
      </div>
    </div>
  );
}

function RecordTollForm({ onRecorded }) {
  const [form, setForm] = useState({
    tollName: '', tollLocation: '', amount: '', highway: '', lane: '',
    direction: 'single', source: 'fastag', crossedAt: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        tollName: form.tollName.trim(),
        tollLocation: form.tollLocation.trim(),
        amount: parseFloat(form.amount),
        direction: form.direction,
        source: form.source,
      };
      if (form.highway.trim()) body.highway = form.highway.trim();
      if (form.lane.trim()) body.lane = form.lane.trim();
      if (form.crossedAt) body.crossedAt = new Date(form.crossedAt).toISOString();

      const data = await apiRequest('/tolls/transactions', { method: 'POST', body });
      setSuccess(`Toll recorded. New FASTag balance: ${formatINR(data.wallet.balance)}`);
      setForm({ tollName: '', tollLocation: '', amount: '', highway: '', lane: '', direction: 'single', source: 'fastag', crossedAt: '' });
      onRecorded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Toll Name / Plaza *</label>
        <input
          name="tollName"
          value={form.tollName}
          onChange={handleChange}
          placeholder="e.g. Khopoli Toll Plaza"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Location *</label>
        <input
          name="tollLocation"
          value={form.tollLocation}
          onChange={handleChange}
          placeholder="e.g. Mumbai-Pune Expressway, KM 78"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Toll Amount (₹) *</label>
        <input
          name="amount"
          type="number"
          min="0.5"
          step="0.5"
          value={form.amount}
          onChange={handleChange}
          placeholder="e.g. 75"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Highway / Route</label>
        <input
          name="highway"
          value={form.highway}
          onChange={handleChange}
          placeholder="e.g. NH-48"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Lane</label>
        <input
          name="lane"
          value={form.lane}
          onChange={handleChange}
          placeholder="e.g. Lane 3"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Crossing Time</label>
        <input
          name="crossedAt"
          type="datetime-local"
          value={form.crossedAt}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Direction</label>
        <select
          name="direction"
          value={form.direction}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="single">Single</option>
          <option value="entry">Entry</option>
          <option value="exit">Exit</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Payment Source</label>
        <select
          name="source"
          value={form.source}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="fastag">FASTag (deduct balance)</option>
          <option value="cash">Cash</option>
          <option value="manual">Manual entry</option>
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {submitting ? 'Recording…' : 'Record Toll Crossing'}
        </button>
        {error && <p className="text-sm text-orange-300">{error}</p>}
        {success && <p className="text-sm text-emerald-300">{success}</p>}
      </div>
    </form>
  );
}

const SOURCE_BADGE = {
  fastag: 'bg-sky-900 text-sky-300',
  cash: 'bg-amber-900 text-amber-300',
  manual: 'bg-slate-700 text-slate-300',
};

const STATUS_DOT = {
  success: 'bg-emerald-400',
  failed: 'bg-red-400',
  pending: 'bg-amber-400',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function TollDashboard() {
  const user = useSelector((state) => state.auth.user);

  const [summary, setSummary] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const loadAll = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, walletData, txData] = await Promise.all([
        apiRequest('/tolls/summary'),
        apiRequest('/tolls/wallet'),
        apiRequest(`/tolls/transactions?page=${page}&limit=15`),
      ]);
      setSummary(summaryData.summary);
      setWallet(walletData.wallet);
      setTransactions(txData.transactions || []);
      setPagination(txData.pagination || { page: 1, pages: 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Toll Tax & FASTag | Speedy Trucks';
    loadAll(1);
  }, [loadAll]);

  const handleRecharged = (newBalance) => {
    setSummary((s) => s ? { ...s, balance: newBalance } : s);
    setWallet((w) => w ? { ...w, balance: newBalance } : w);
    setTimeout(() => setShowRechargeModal(false), 1500);
    loadAll(1);
  };

  const handleExportCSV = async () => {
    setExportLoading(true);
    try {
      // Fetch all transactions for export
      const data = await apiRequest('/tolls/transactions?page=1&limit=1000');
      const rows = data.transactions || [];
      if (rows.length === 0) {
        setExportLoading(false);
        return;
      }
      const headers = ['Date', 'Toll Name', 'Location', 'Highway', 'Lane', 'Direction', 'Amount (₹)', 'Balance After (₹)', 'Source', 'Vehicle', 'Status', 'Ref'];
      const csv = [
        headers.join(','),
        ...rows.map((r) => [
          formatDate(r.crossedAt),
          `"${(r.tollName || '').replace(/"/g, '""')}"`,
          `"${(r.tollLocation || '').replace(/"/g, '""')}"`,
          r.highway || '',
          r.lane || '',
          r.direction || '',
          r.amount,
          r.balanceAfter ?? '',
          r.source || '',
          r.vehicleNumber || '',
          r.status || '',
          r.transactionRef || '',
        ].join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `toll-transactions-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const walletSetup = Boolean(wallet);
  const isLowBalance = summary?.walletStatus === 'low_balance';

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Toll Tax &amp; FASTag</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Toll Tax Dashboard</h1>
            <p className="mt-4 text-slate-300">
              Track every toll crossing, monitor FASTag balance and recharge instantly — all from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {walletSetup && (
              <>
                <button
                  onClick={() => setShowRechargeModal(true)}
                  className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                >
                  ⚡ Recharge FASTag
                </button>
                <button
                  onClick={() => setShowRecordForm((v) => !v)}
                  className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  {showRecordForm ? 'Cancel' : '+ Record Toll'}
                </button>
              </>
            )}
            <button
              onClick={() => setShowSetupForm((v) => !v)}
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              {showSetupForm ? 'Cancel' : (walletSetup ? 'Edit Wallet' : '⚙ Set Up FASTag')}
            </button>
          </div>
        </div>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        {/* Low balance warning */}
        {!loading && isLowBalance && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-orange-400/30 bg-orange-900/20 px-5 py-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-orange-300">Low FASTag Balance!</p>
              <p className="text-xs text-orange-200/80 mt-0.5">
                Your balance ({formatINR(summary?.balance)}) is below the alert threshold ({formatINR(summary?.lowBalanceThreshold)}). Recharge now to avoid toll delays.
              </p>
            </div>
            <button
              onClick={() => setShowRechargeModal(true)}
              className="ml-auto flex-shrink-0 rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
            >
              Recharge Now
            </button>
          </div>
        )}

        {/* Wallet setup form */}
        {showSetupForm && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <h2 className="text-lg font-semibold text-white">{walletSetup ? 'Update FASTag Wallet' : 'Set Up FASTag Wallet'}</h2>
            <p className="mt-1 text-sm text-slate-400">Link your vehicle and FASTag details to start tracking tolls and managing balance.</p>
            <WalletSetupForm
              existingWallet={wallet}
              onSaved={() => { setShowSetupForm(false); loadAll(1); }}
            />
          </div>
        )}

        {/* Record toll form */}
        {showRecordForm && walletSetup && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <h2 className="text-lg font-semibold text-white">Record toll crossing</h2>
            <p className="mt-1 text-sm text-slate-400">
              Manually log a toll crossing. When source is FASTag, the amount will be deducted from your balance.
            </p>
            <RecordTollForm onRecorded={() => { setShowRecordForm(false); loadAll(1); }} />
          </div>
        )}

        {/* Stats cards */}
        {!walletSetup && !loading ? (
          <div className="mt-10 rounded-3xl border border-dashed border-white/20 bg-slate-900/40 p-10 text-center">
            <p className="text-2xl">🏷️</p>
            <p className="mt-3 text-lg font-semibold text-white">No FASTag wallet set up yet</p>
            <p className="mt-2 text-sm text-slate-400">Click &ldquo;Set Up FASTag&rdquo; above to link your vehicle and start tracking toll expenses.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">FASTag Balance</p>
              <p className={`mt-4 text-3xl font-semibold ${isLowBalance ? 'text-orange-400' : 'text-emerald-400'}`}>
                {loading ? '—' : formatINR(summary?.balance)}
              </p>
              {wallet?.vehicleNumber && (
                <p className="mt-2 text-xs text-slate-500">{wallet.vehicleNumber}</p>
              )}
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">This month</p>
              <p className="mt-4 text-3xl font-semibold text-white">
                {loading ? '—' : formatINR(summary?.monthlySpend)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {loading ? '' : `${summary?.monthlyCrossings ?? 0} crossing${summary?.monthlyCrossings !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Total spend</p>
              <p className="mt-4 text-3xl font-semibold text-white">
                {loading ? '—' : formatINR(summary?.totalSpend)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {loading ? '' : `${summary?.totalCrossings ?? 0} total crossings`}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Last recharge</p>
              <p className="mt-4 text-2xl font-semibold text-white">
                {loading ? '—' : (summary?.lastRechargeAmount ? formatINR(summary.lastRechargeAmount) : 'Never')}
              </p>
              {summary?.lastRechargeAt && (
                <p className="mt-2 text-xs text-slate-500">{formatDate(summary.lastRechargeAt)}</p>
              )}
            </div>
          </div>
        )}

        {/* Wallet info bar */}
        {walletSetup && !loading && (
          <div className="mt-6 flex flex-wrap gap-4 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm">
            <div><span className="text-slate-400">Vehicle: </span><span className="font-medium text-white">{wallet.vehicleNumber}</span></div>
            {wallet.tagId && <div><span className="text-slate-400">Tag ID: </span><span className="font-medium text-white">{wallet.tagId}</span></div>}
            {wallet.bankName && <div><span className="text-slate-400">Bank: </span><span className="font-medium text-white">{wallet.bankName}</span></div>}
            <div>
              <span className="text-slate-400">Status: </span>
              <span className={`font-medium ${wallet.status === 'active' ? 'text-emerald-400' : wallet.status === 'low_balance' ? 'text-orange-400' : 'text-red-400'}`}>
                {wallet.status === 'low_balance' ? 'Low Balance' : wallet.status === 'active' ? 'Active' : wallet.status}
              </span>
            </div>
          </div>
        )}

        {/* Transaction history */}
        {walletSetup && (
          <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Toll history</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Toll crossings</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => loadAll(pagination.page)}
                  className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                >
                  Refresh
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={exportLoading || transactions.length === 0}
                  className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {exportLoading ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400">
                  <tr>
                    <th className="px-5 py-4 font-semibold uppercase">Date &amp; Time</th>
                    <th className="px-5 py-4 font-semibold uppercase">Toll / Location</th>
                    <th className="px-5 py-4 font-semibold uppercase">Highway</th>
                    <th className="px-5 py-4 font-semibold uppercase">Amount</th>
                    <th className="px-5 py-4 font-semibold uppercase">Balance After</th>
                    <th className="px-5 py-4 font-semibold uppercase">Source</th>
                    <th className="px-5 py-4 font-semibold uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-slate-950/90">
                  {loading ? (
                    <tr><td colSpan="7" className="px-5 py-6 text-slate-400">Loading transactions…</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-5 py-8 text-center text-slate-400">
                        No toll crossings recorded yet. Click &ldquo;Record Toll&rdquo; to log your first crossing.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-900/60">
                        <td className="px-5 py-4 text-slate-300 whitespace-nowrap">{formatDate(tx.crossedAt)}</td>
                        <td className="px-5 py-4">
                          <p className="text-white font-medium">{tx.tollName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{tx.tollLocation}</p>
                          {tx.lane && <p className="text-xs text-slate-500">{tx.lane} · {tx.direction}</p>}
                        </td>
                        <td className="px-5 py-4 text-slate-300">{tx.highway || '—'}</td>
                        <td className="px-5 py-4 font-semibold text-white">{formatINR(tx.amount)}</td>
                        <td className="px-5 py-4 text-slate-300">
                          {tx.balanceAfter !== null && tx.balanceAfter !== undefined ? formatINR(tx.balanceAfter) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${SOURCE_BADGE[tx.source] || 'bg-slate-700 text-slate-300'}`}>
                            {tx.source}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[tx.status] || 'bg-slate-400'}`} />
                            <span className="text-slate-300 capitalize">{tx.status}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
                <p className="text-sm text-slate-400">Page {pagination.page} of {pagination.pages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadAll(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => loadAll(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Recharge modal */}
      {showRechargeModal && wallet && (
        <RechargeModal
          wallet={wallet}
          user={user}
          onRecharged={handleRecharged}
          onClose={() => setShowRechargeModal(false)}
        />
      )}
    </main>
  );
}
