import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { loginUser, verifyAdminMfa } from '../features/auth/authSlice';

export function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const loading = useSelector((state) => state.auth.loading);
  const error = useSelector((state) => state.auth.error);
  const mfaRequired = useSelector((state) => state.auth.mfaRequired);
  const mfaChallengeToken = useSelector((state) => state.auth.mfaChallengeToken);
  const mfaEmail = useSelector((state) => state.auth.mfaEmail);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await dispatch(loginUser({ email, password }));
    if (result.payload && result.payload.user) {
      navigate(`/dashboard/${result.payload.user.role}`);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    const result = await dispatch(verifyAdminMfa({
      email: mfaEmail || email,
      mfaChallengeToken,
      mfaCode,
    }));
    if (result.payload && result.payload.user) {
      navigate(`/dashboard/${result.payload.user.role}`);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">JWT Authentication</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Access Speedy Trucks</h1>
        <p className="mt-3 text-slate-300">Sign in with your email and password. Admin access requires a one-time MFA code.</p>

        {error && <div className="mt-6 rounded-3xl bg-orange-500/10 p-4 text-sm text-orange-300">{error}</div>}

        {!mfaRequired && (
          <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-200">
              Email address
              <input
                className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                disabled={loading}
              />
            </label>

            <label className="block text-sm font-medium text-slate-200">
              Password
              <input
                className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="mt-6 flex flex-col gap-3 text-center text-sm text-slate-400 sm:flex-row sm:justify-between sm:text-left">
              <p>
                Don't have an account?{' '}
                <Link to="/register" className="text-orange-300 hover:text-orange-400">
                  Register here
                </Link>
              </p>
              <Link to="/forgot-password" className="text-orange-300 hover:text-orange-400">
                Forgot password?
              </Link>
            </div>
          </form>
        )}

        {mfaRequired && (
          <form className="mt-10 space-y-6" onSubmit={handleMfaSubmit}>
            <div className="rounded-3xl bg-sky-500/10 p-4 text-sm text-sky-200">
              Enter the 6-digit verification code sent to {mfaEmail || email}.
            </div>

            <label className="block text-sm font-medium text-slate-200">
              MFA code
              <input
                className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                disabled={loading}
              />
            </label>

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full rounded-3xl bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify MFA'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
