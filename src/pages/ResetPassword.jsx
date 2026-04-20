import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';

function getPasswordErrors(password) {
  const errors = [];
  if (!password || password.length < 12) errors.push('Password must be at least 12 characters.');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a digit.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain a special character.');
  return errors;
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [complexityErrors, setComplexityErrors] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setStatus('mismatch');
      return;
    }
    const errors = getPasswordErrors(password);
    if (errors.length > 0) {
      setComplexityErrors(errors);
      setStatus('weak');
      return;
    }
    setComplexityErrors([]);
    setStatus('sending');
    try {
      await apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
      setStatus('success');
      setTimeout(() => navigate('/login'), 1500);
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Set new password</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Reset your account password</h1>
        <p className="mt-3 text-slate-300">Enter a new password to restore access to your account.</p>

        <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400"
          >
            {status === 'sending' ? 'Resetting password...' : 'Reset password'}
          </button>
          {status === 'mismatch' && <p className="text-orange-300">Passwords do not match.</p>}
          {status === 'weak' && complexityErrors.map((e) => <p key={e} className="text-orange-300">{e}</p>)}
          {status === 'success' && <p className="text-green-300">Password reset successfully. Redirecting to login...</p>}
          {status === 'error' && <p className="text-orange-300">Unable to reset password. Please try again.</p>}
        </form>
      </div>
    </main>
  );
}
