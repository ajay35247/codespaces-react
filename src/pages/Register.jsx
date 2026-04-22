import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuthError, registerUser } from '../features/auth/authSlice';
import { ROLE_CARDS } from '../data/roles';

const PUBLIC_ROLE_KEYS = ROLE_CARDS.map((roleOption) => roleOption.key);

function sanitizeRegisterPayload(formData) {
  const role = PUBLIC_ROLE_KEYS.includes(formData.role) ? formData.role : 'shipper';
  const payload = {
    name: String(formData.name || '').trim(),
    email: String(formData.email || '').trim().toLowerCase(),
    password: formData.password,
    role,
  };

  const phone = String(formData.phone || '').trim();
  const gstin = String(formData.gstin || '').trim().toUpperCase();

  if (phone) payload.phone = phone;
  if (gstin) payload.gstin = gstin;

  return payload;
}

function getPasswordErrors(password = '') {
  const value = String(password);
  const errors = [];

  if (value.length < 6 || value.length > 8) {
    errors.push('Password must be between 6 and 8 characters');
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push('Password must include at least one special character');
  }

  return errors;
}

export function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const loading = useSelector((state) => state.auth.loading);
  const error = useSelector((state) => state.auth.error);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    role: 'shipper',
    phone: '',
    gstin: '',
  });
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setMessage('');

    if (formData.password !== formData.passwordConfirm) {
      setLocalError('Passwords do not match.');
      return;
    }

    const passwordErrors = getPasswordErrors(formData.password);
    if (passwordErrors.length > 0) {
      setLocalError(`Password requirements: ${passwordErrors.join(', ')}`);
      return;
    }

    const payload = sanitizeRegisterPayload(formData);
    const result = await dispatch(registerUser(payload));
    if (result.meta.requestStatus !== 'fulfilled') {
      const details = Array.isArray(result.payload?.details) ? result.payload.details : [];
      if (details.length > 0) {
        setLocalError(details.join(' '));
      } else if (result.payload?.message) {
        setLocalError(result.payload.message);
      }
      return;
    }
    // Public registration is instant – server auto-verifies the account and
    // sets auth cookies. Navigate straight to the role dashboard.
    const user = result.payload?.user;
    if (user?.role) {
      navigate(`/dashboard/${user.role}`);
      return;
    }
    if (result.payload?.message) {
      setMessage(result.payload.message);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Create Account</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Join Speedy Trucks</h1>
        <p className="mt-3 text-slate-300">Register as a shipper, driver, or broker.</p>

        {localError && <div className="mt-6 rounded-3xl bg-rose-500/10 p-4 text-sm text-rose-300">{localError}</div>}
        {error && <div className="mt-6 rounded-3xl bg-orange-500/10 p-4 text-sm text-orange-300">{error}</div>}

        <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            Full Name
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              required
              disabled={loading}
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Email address
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@gmail.com or name@company.com"
              required
              disabled={loading}
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              disabled={loading}
            />
            <p className="mt-2 text-xs text-slate-400">
              Must be between 6 and 8 characters and include at least one special character.
            </p>
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Confirm Password
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="password"
              name="passwordConfirm"
              value={formData.passwordConfirm}
              onChange={handleChange}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            User role
            <select
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={loading}
            >
              {ROLE_CARDS.map((roleOption) => (
                <option key={roleOption.key} value={roleOption.key}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Phone (optional)
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91 98765 43210"
              disabled={loading}
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            GST ID (optional)
            <input
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500 disabled:opacity-50"
              type="text"
              name="gstin"
              value={formData.gstin}
              onChange={handleChange}
              placeholder="27AAPCU9603R1Z0"
              disabled={loading}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-3xl bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          {message && <p className="mt-4 rounded-3xl bg-emerald-500/10 p-4 text-sm text-emerald-300">{message}</p>}
          <p className="mt-4 text-sm text-slate-400">Your account is created and signed in instantly.</p>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <a href="/login" className="text-orange-300 hover:text-orange-400">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
