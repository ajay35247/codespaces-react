import { useState } from 'react';
import { apiRequest } from '../utils/api';

export function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState(null);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('sending');
    try {
      await apiRequest('/support/contact', { method: 'POST', body: form });
      setStatus('submitted');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Contact support</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Need help with Speedy Trucks?</h1>
        <p className="mt-4 text-slate-300">Drop a message and our support team will get back to you promptly. For critical issues, use support@aptrucking.in.</p>

        <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            Name
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Subject
            <input
              type="text"
              name="subject"
              value={form.subject}
              onChange={handleChange}
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Message
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              rows="5"
              required
              className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending...' : 'Submit request'}
          </button>
          {status === 'submitted' && <p className="text-green-300">Thanks! Your request has been sent.</p>}
          {status === 'error' && <p className="text-orange-300">Unable to send. Please try again later.</p>}
        </form>
      </div>
    </main>
  );
}
