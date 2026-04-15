import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../features/auth/authSlice';
import { ROLE_CARDS } from '../data/roles';

const ADMIN_EMAIL = 'ajay35247@gmail.com';

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
  const canSelectAdmin = formData.email.trim().toLowerCase() === ADMIN_EMAIL;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formData.password !== formData.passwordConfirm) {
      alert('Passwords do not match');
      return;
    }

    const { passwordConfirm, ...payload } = formData;
    const result = await dispatch(registerUser(payload));
    if (result.payload && result.payload.verificationUrl) {
      setMessage('Registration successful. Check your inbox for a verification link before logging in.');
      return;
    }
    if (result.payload && result.payload.user) {
      navigate(`/dashboard/${result.payload.user.role}`);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Create Account</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Join Speedy Trucks</h1>
        <p className="mt-3 text-slate-300">Register as a shipper, driver, broker, or fleet manager. Admin role is restricted.</p>

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
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              disabled={loading}
            />
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
              {ROLE_CARDS.filter((roleOption) => canSelectAdmin || roleOption.key !== 'admin').map((roleOption) => (
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
          <p className="mt-4 text-sm text-slate-400">A verification link will be sent to your email address after registration.</p>

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
