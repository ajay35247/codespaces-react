import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../utils/api';

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

function formatAmount(amount, currency = 'INR') {
  if (typeof amount !== 'number') return '—';
  return `${currency === 'INR' ? '₹' : ''}${amount.toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

export function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [topupAmount, setTopupAmount] = useState('500');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest('/wallet');
      setWallet(data.wallet || null);
      setRecent(data.recentTransactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Wallet | Speedy Trucks';
    refresh();
  }, [refresh]);

  const handleTopup = async (event) => {
    event.preventDefault();
    setStatus('processing');
    setError(null);
    try {
      const amount = Number.parseInt(topupAmount, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Enter a valid top-up amount');
      }
      const order = await apiRequest('/wallet/topup', {
        method: 'POST',
        body: { amount },
      });
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Unable to load Razorpay checkout');

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Speedy Trucks Wallet',
        description: `Wallet top-up ₹${amount}`,
        order_id: order.orderId,
        handler: async (response) => {
          try {
            await apiRequest('/wallet/topup/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            setStatus('topup-success');
            await refresh();
          } catch (verifyError) {
            setStatus('error');
            setError(verifyError.message);
          }
        },
        theme: { color: '#0B3D91' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
      setStatus('redirect');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const handleWithdraw = async (event) => {
    event.preventDefault();
    setStatus('processing');
    setError(null);
    try {
      const amount = Number.parseInt(withdrawAmount, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Enter a valid withdrawal amount');
      }
      if (!withdrawAccount || withdrawAccount.trim().length < 4) {
        throw new Error('Provide a bank account or UPI reference');
      }
      await apiRequest('/wallet/withdraw', {
        method: 'POST',
        body: { amount, accountReference: withdrawAccount.trim() },
      });
      setStatus('withdraw-success');
      setWithdrawAmount('');
      setWithdrawAccount('');
      await refresh();
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Wallet</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Your Speedy Trucks wallet</h1>
        <p className="mt-3 text-slate-300">
          Top-up with Razorpay, settle fees instantly, and withdraw to your bank.
          Withdrawals are an advanced feature included with every paid subscription plan.
        </p>

        {loading ? (
          <div className="mt-10 animate-pulse rounded-3xl border border-white/10 bg-slate-900 p-6 h-40" />
        ) : (
          <>
            <section className="mt-10 grid gap-6 rounded-3xl border border-white/10 bg-slate-900 p-6 sm:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Balance</p>
                <p className="mt-3 text-5xl font-semibold text-white">
                  {formatAmount(wallet?.balance ?? 0, wallet?.currency)}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {wallet?.locked
                    ? 'Wallet is currently locked — contact support.'
                    : `Last activity: ${formatDate(wallet?.lastTransactionAt)}`}
                </p>
              </div>

              <form onSubmit={handleTopup} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-slate-200" htmlFor="topup-amount">
                  Top-up amount (INR)
                </label>
                <input
                  id="topup-amount"
                  className="rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
                  type="number"
                  min="100"
                  max="500000"
                  step="100"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={status === 'processing'}
                  className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
                >
                  Top up wallet
                </button>
              </form>
            </section>

            <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Withdraw funds</h2>
              <p className="mt-1 text-sm text-slate-400">
                Requires an active subscription. Withdrawals are processed offline within 24–48 hours.
              </p>
              <form onSubmit={handleWithdraw} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  aria-label="Withdrawal amount"
                  className="rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
                  type="number"
                  min="100"
                  step="100"
                  placeholder="Amount (INR)"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                />
                <input
                  aria-label="Bank or UPI reference"
                  className="rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
                  type="text"
                  placeholder="Bank A/C or UPI ID"
                  value={withdrawAccount}
                  onChange={(e) => setWithdrawAccount(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={status === 'processing'}
                  className="rounded-full bg-slate-700 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  Request
                </button>
              </form>
            </section>

            <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Recent transactions</h2>
              {recent.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No transactions yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-800">
                  {recent.map((tx) => (
                    <li key={tx._id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {tx.type === 'credit' ? '＋' : '−'} {formatAmount(tx.amount, tx.currency)}
                          <span className="ml-2 text-xs uppercase tracking-widest text-slate-400">
                            {tx.purpose}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(tx.createdAt)}</p>
                      </div>
                      <span
                        className={
                          tx.status === 'completed'
                            ? 'text-xs font-semibold uppercase tracking-widest text-emerald-400'
                            : tx.status === 'pending'
                              ? 'text-xs font-semibold uppercase tracking-widest text-amber-300'
                              : 'text-xs font-semibold uppercase tracking-widest text-rose-400'
                        }
                      >
                        {tx.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}
        {status === 'processing' && <p className="mt-6 text-sm text-sky-300">Processing your request...</p>}
        {status === 'redirect' && <p className="mt-6 text-sm text-sky-300">Razorpay checkout opened.</p>}
        {status === 'topup-success' && <p className="mt-6 text-sm text-emerald-300">Wallet topped up successfully.</p>}
        {status === 'withdraw-success' && <p className="mt-6 text-sm text-emerald-300">Withdrawal request submitted.</p>}
      </div>
    </main>
  );
}
