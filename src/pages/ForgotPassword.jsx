import { useState } from 'react';
import { buildApiUrl } from '../utils/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('sending');
    try {
      const response = await fetch(buildApiUrl('/auth/request-password-reset'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error('Request failed');
      setStatus('sent');
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Reset password</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Forgot your password?</h1>
        <p className="mt-3 text-slate-300">Enter your registered email and we&#39;ll send a secure reset link to your inbox.</p>

        <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            Registered email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400"
          >
            {status === 'sending' ? 'Sending reset link...' : 'Send reset link'}
          </button>
          {status === 'sent' && <p className="text-green-300">Check your inbox for reset instructions.</p>}
          {status === 'error' && <p className="text-orange-300">Unable to submit. Please try again.</p>}
        </form>
      </div>
    </main>
  );
}
