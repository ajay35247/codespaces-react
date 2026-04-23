import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';
import { Card3D } from '../components/Card3D';
import { DashboardShell } from '../components/DashboardShell';

const KYC_STYLE = {
  approved: { badge: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300', icon: '✅', label: 'Verified' },
  pending:  { badge: 'border-amber-400/30  bg-amber-500/10  text-amber-300',   icon: '⏳', label: 'Pending' },
  rejected: { badge: 'border-rose-400/30   bg-rose-500/10   text-rose-300',    icon: '❌', label: 'Rejected' },
};

const ROLE_META = {
  shipper:     { icon: '🚢', color: 'text-sky-400',    label: 'Shipper' },
  driver:      { icon: '🚛', color: 'text-amber-400',  label: 'Driver' },
  broker:      { icon: '🤝', color: 'text-emerald-400',label: 'Broker' },
  truck_owner: { icon: '🏭', color: 'text-violet-400', label: 'Fleet Owner' },
  admin:       { icon: '⚡', color: 'text-rose-400',   label: 'Admin' },
};

/** Animated SVG trust score ring. */
function TrustRing({ score }) {
  const radius = 40;
  const stroke = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#f59e0b' : '#f87171';
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={100} height={100} className="rotate-[-90deg]">
        <circle cx={50} cy={50} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={50} cy={50} r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-white tabular-nums">{score}</span>
        <span className="text-[9px] text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

/** 5-star rating display. */
function StarRow({ avg, count }) {
  const filled = Math.round(avg || 0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className={`text-lg ${s <= filled ? 'text-amber-400' : 'text-slate-700'}`}>★</span>
        ))}
      </div>
      <span className="text-xs text-slate-400">
        {avg ? avg.toFixed(1) : '—'} ({count || 0} {(count || 0) === 1 ? 'review' : 'reviews'})
      </span>
    </div>
  );
}

/**
 * UserProfilePanel
 *
 * Unified profile page reachable at /profile for all roles.  Shows:
 *  - Role badge, KYC status, trust score ring
 *  - Performance stats (delivered, active, avg rating)
 *  - Inline profile edit (name, phone, GSTIN)
 *  - KYC document list with status badges
 *  - Fund account summary
 */
export function UserProfilePanel() {
  const authUser = useSelector((s) => s.auth.user);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', gstin: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const fetchProfile = () => {
    setLoading(true);
    setApiError(null);
    apiRequest('/profile')
      .then((d) => {
        setProfile(d.profile);
        setStats(d.stats);
        setForm({
          name:  d.profile.name  || '',
          phone: d.profile.phone || '',
          gstin: d.profile.gstin || '',
        });
      })
      .catch((err) => setApiError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authUser?.id) fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      await apiRequest('/profile', { method: 'PATCH', body: form });
      setSaveMsg('Profile updated successfully!');
      setEditing(false);
      fetchProfile();
    } catch (err) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const role = profile?.role || authUser?.role;
  const roleMeta = ROLE_META[role] || ROLE_META.shipper;
  const kycStyle = KYC_STYLE[profile?.kycStatus || 'pending'];

  return (
    <DashboardShell>
      <main className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* ── Hero header ── */}
          <section className="relative overflow-hidden rounded-[2rem] bg-slate-950/92 p-8 shadow-2xl ring-1 ring-white/10 mb-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(249,115,22,0.12),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(56,189,248,0.10),transparent_40%)]" />
            <div className="perspective-grid absolute inset-0 opacity-30" />

            <div className="relative flex flex-wrap items-start gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-orange-500/30 to-amber-400/20 border border-white/10 flex items-center justify-center text-3xl shadow-xl">
                  {roleMeta.icon}
                </div>
                {profile?.kycStatus === 'approved' && (
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center text-[10px]">
                    ✓
                  </div>
                )}
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h1 className="text-2xl font-black text-white">
                    {loading ? '…' : (profile?.name || authUser?.name || 'User')}
                  </h1>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold border-current/30 ${roleMeta.color}`}>
                    {roleMeta.label}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kycStyle.badge}`}>
                    {kycStyle.icon} {kycStyle.label}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{profile?.email || authUser?.email}</p>
                {profile?.phone && (
                  <p className="text-sm text-slate-500 mt-0.5">📱 {profile.phone}</p>
                )}
                {profile?.gstin && (
                  <p className="text-sm text-slate-500 mt-0.5">🔖 GSTIN: {profile.gstin}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-600">
                  Member since{' '}
                  {profile?.createdAt
                    ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              </div>

              {/* Trust score ring */}
              {stats && (
                <div className="text-center shrink-0">
                  <TrustRing score={stats.trustScore || 0} />
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">Trust Score</p>
                </div>
              )}
            </div>
          </section>

          {apiError && (
            <div className="mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {apiError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Performance stats ── */}
            <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-orange-300 mb-4">Performance</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-2xl bg-white/4 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-400 tabular-nums">
                    {loading ? '—' : (stats?.deliveredCount ?? 0)}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500 uppercase tracking-wide">Delivered</p>
                </div>
                <div className="rounded-2xl bg-white/4 p-4 text-center">
                  <p className="text-2xl font-black text-amber-400 tabular-nums">
                    {loading ? '—' : (stats?.activeCount ?? 0)}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500 uppercase tracking-wide">Active</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Rating</p>
                {loading ? (
                  <div className="h-5 w-40 bg-slate-800 rounded-full animate-pulse" />
                ) : stats?.ratingCount > 0 ? (
                  <StarRow avg={stats.avgRating} count={stats.ratingCount} />
                ) : (
                  <p className="text-sm text-slate-600">No ratings yet</p>
                )}
              </div>
            </Card3D>

            {/* ── Editable profile details ── */}
            <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-sky-300">Profile Details</p>
                {!editing && !loading && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {editing ? (
                <form onSubmit={handleSave} className="space-y-3">
                  {[
                    { key: 'name',  label: 'Full name', type: 'text', required: true, min: 2, max: 120 },
                    { key: 'phone', label: 'Phone',     type: 'text', required: false, max: 30 },
                    { key: 'gstin', label: 'GSTIN',     type: 'text', required: false, max: 30 },
                  ].map(({ key, label, type, required, min, max }) => (
                    <div key={key}>
                      <label className="block text-[10px] text-slate-500 mb-1">{label}</label>
                      <input
                        type={type}
                        required={required}
                        minLength={min}
                        maxLength={max}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder={required ? undefined : 'Optional'}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                  ))}
                  {saveMsg && (
                    <p className={`text-xs ${saveMsg.includes('success') ? 'text-emerald-300' : 'text-orange-300'}`}>
                      {saveMsg}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setSaveMsg(''); }}
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="space-y-2.5 text-sm">
                  {[
                    { label: 'Name',    value: profile?.name  || '—' },
                    { label: 'Email',   value: profile?.email || '—' },
                    { label: 'Phone',   value: profile?.phone || '—' },
                    { label: 'GSTIN',   value: profile?.gstin || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500 shrink-0">{label}</dt>
                      <dd className="text-white font-medium text-right truncate">{loading ? '…' : value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500 shrink-0">Account</dt>
                    <dd>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        profile?.accountStatus === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-rose-500/10 text-rose-300'
                      }`}>
                        {profile?.accountStatus || 'active'}
                      </span>
                    </dd>
                  </div>
                </dl>
              )}
            </Card3D>

            {/* ── KYC documents ── */}
            <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-violet-300">KYC & Verification</p>
                <a
                  href="/kyc"
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  {(profile?.kycDocuments || []).length === 0 ? '+ Submit KYC' : 'Manage KYC →'}
                </a>
              </div>

              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="shimmer-slide relative h-16 rounded-2xl bg-slate-800 overflow-hidden animate-pulse" />
                  ))}
                </div>
              ) : (profile?.kycDocuments || []).length === 0 ? (
                <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 p-4 text-center">
                  <p className="text-sm text-amber-300 mb-1">⚠️ No KYC documents submitted</p>
                  <p className="text-xs text-slate-500">
                    Submit your Aadhaar / PAN / Driving License to get verified and boost your trust score.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.kycDocuments.map((doc) => (
                    <div key={doc.docType} className="rounded-2xl bg-white/4 border border-white/8 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white uppercase tracking-wide">
                          {doc.docType.replace(/_/g, ' ')}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${kycStyle.badge}`}>
                          {kycStyle.icon} {profile.kycStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Holder: {doc.holderName}</p>
                      <p className="text-[11px] text-slate-600">
                        Submitted: {new Date(doc.submittedAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {profile?.kycRejectionReason && (
                <div className="mt-3 rounded-2xl bg-rose-500/5 border border-rose-500/15 p-3">
                  <p className="text-xs text-rose-300">⚠️ Rejection reason: {profile.kycRejectionReason}</p>
                </div>
              )}
            </Card3D>

            {/* ── Fund / payout account ── */}
            {profile?.fundAccount && (
              <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">Payout Account</p>
                  <a href="/kyc" className="text-[11px] text-slate-400 hover:text-white transition">Update →</a>
                </div>
                <dl className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <dt className="text-[10px] text-slate-500 mb-0.5">Method</dt>
                    <dd className="font-semibold text-white capitalize">{profile.fundAccount.method}</dd>
                  </div>
                  {profile.fundAccount.vpa && (
                    <div>
                      <dt className="text-[10px] text-slate-500 mb-0.5">UPI VPA</dt>
                      <dd className="font-semibold text-white">{profile.fundAccount.vpa}</dd>
                    </div>
                  )}
                  {profile.fundAccount.beneficiaryName && (
                    <div>
                      <dt className="text-[10px] text-slate-500 mb-0.5">Beneficiary</dt>
                      <dd className="font-semibold text-white">{profile.fundAccount.beneficiaryName}</dd>
                    </div>
                  )}
                </dl>
              </Card3D>
            )}
          </div>
        </motion.div>
      </main>
    </DashboardShell>
  );
}
