import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

/**
 * KYC submission + fund-account registration page.  Keeps the UI
 * intentionally plain — this isn't a vendor-verified KYC (that needs a paid
 * Aadhaar/PAN licensee).  It submits documents for admin review and lets
 * drivers / brokers set the payout destination (UPI VPA or IFSC + a/c) that
 * RazorpayX Payouts will hit when a shipper releases escrow.
 */

const DOC_TYPES = [
  { id: 'pan', label: 'PAN Card' },
  { id: 'aadhaar', label: 'Aadhaar' },
  { id: 'driving_license', label: 'Driving License' },
  { id: 'rc_book', label: 'Vehicle RC Book' },
  { id: 'gstin', label: 'GSTIN Certificate' },
];

const MAX_FILE_BYTES = 250 * 1024; // 250 KB

function StatusPill({ status }) {
  const styles = {
    approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    pending: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${styles[status] || styles.pending}`}>
      {status || 'pending'}
    </span>
  );
}

export function Kyc() {
  const [kyc, setKyc] = useState(null);
  const [fundAccount, setFundAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [docs, setDocs] = useState([{ docType: 'pan', number: '', holderName: '', fileDataUrl: '' }]);
  const [fa, setFa] = useState({ method: 'vpa', vpa: '', accountNumber: '', ifsc: '', beneficiaryName: '' });
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      apiRequest('/auth/kyc').catch(() => null),
      apiRequest('/auth/fund-account').catch(() => null),
    ])
      .then(([kycData, faData]) => {
        setKyc(kycData);
        setFundAccount(faData?.fundAccount || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleFile = (index, file) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (max ${Math.floor(MAX_FILE_BYTES / 1024)} KB)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...docs];
      next[index] = { ...next[index], fileDataUrl: String(reader.result || '') };
      setDocs(next);
    };
    reader.readAsDataURL(file);
  };

  const addDoc = () => {
    if (docs.length >= 4) return;
    setDocs([...docs, { docType: 'aadhaar', number: '', holderName: '', fileDataUrl: '' }]);
  };
  const removeDoc = (i) => setDocs(docs.filter((_, idx) => idx !== i));
  const updateDoc = (i, patch) => {
    const next = [...docs];
    next[i] = { ...next[i], ...patch };
    setDocs(next);
  };

  const submitKyc = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess('');
    setSubmitting(true);
    try {
      const sanitized = docs.map((d) => ({
        docType: d.docType,
        number: d.number.trim(),
        holderName: d.holderName.trim(),
        ...(d.fileDataUrl ? { fileDataUrl: d.fileDataUrl } : {}),
      }));
      for (const d of sanitized) {
        if (!d.number || !d.holderName) {
          setError('Number and holder name are required for every document');
          setSubmitting(false);
          return;
        }
      }
      const result = await apiRequest('/auth/kyc', { method: 'POST', body: { documents: sanitized } });
      setSuccess(result.message || 'Submitted for review');
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitFa = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess('');
    setSubmitting(true);
    try {
      const body = fa.method === 'vpa'
        ? { method: 'vpa', vpa: fa.vpa.trim(), beneficiaryName: fa.beneficiaryName.trim() }
        : { method: 'bank', accountNumber: fa.accountNumber.trim(), ifsc: fa.ifsc.trim().toUpperCase(), beneficiaryName: fa.beneficiaryName.trim() };
      const result = await apiRequest('/auth/fund-account', { method: 'POST', body });
      setSuccess(result.message || 'Fund account saved');
      setFundAccount(result.fundAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Identity &amp; Payouts</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">KYC &amp; payout setup</h1>
        <p className="mt-4 text-slate-300">Submit KYC documents for admin review, and register where to receive freight payments.</p>

        {error && <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>}
        {success && <p className="mt-6 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-300">{success}</p>}

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">KYC status</h2>
            <StatusPill status={kyc?.kycStatus || 'pending'} />
          </div>
          {kyc?.kycRejectionReason && (
            <p className="mt-3 text-sm text-rose-300">Reviewer note: {kyc.kycRejectionReason}</p>
          )}
          {kyc?.kycSubmittedAt && (
            <p className="mt-2 text-xs text-slate-400">Last submitted: {new Date(kyc.kycSubmittedAt).toLocaleString()}</p>
          )}
          {!!(kyc?.documents?.length) && (
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {kyc.documents.map((d, i) => (
                <li key={i} className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-2">
                  <span>{DOC_TYPES.find((t) => t.id === d.docType)?.label || d.docType} — {d.number}</span>
                  <span className="text-xs text-slate-500">{d.hasFile ? 'file attached' : 'no file'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={submitKyc} className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">
            {kyc?.kycStatus === 'approved' ? 'Re-submit documents' : 'Submit documents for review'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">Add at least one document. An admin reviewer will approve or reject within 24 hours.</p>

          <div className="mt-4 space-y-4">
            {docs.map((d, i) => (
              <div key={i} className="rounded-2xl bg-slate-950/60 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-slate-400">
                    Document type
                    <select
                      value={d.docType}
                      onChange={(e) => updateDoc(i, { docType: e.target.value })}
                      className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Document number
                    <input
                      type="text"
                      value={d.number}
                      onChange={(e) => updateDoc(i, { number: e.target.value })}
                      required
                      className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Holder name (as on doc)
                    <input
                      type="text"
                      value={d.holderName}
                      onChange={(e) => updateDoc(i, { holderName: e.target.value })}
                      required
                      className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="text-xs text-slate-400">
                    Upload (PNG/JPEG/PDF, ≤ {Math.floor(MAX_FILE_BYTES / 1024)} KB)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={(e) => handleFile(i, e.target.files?.[0])}
                      className="mt-1 block text-xs text-slate-300"
                    />
                  </label>
                  {d.fileDataUrl && <span className="text-xs text-emerald-300">file loaded</span>}
                  {docs.length > 1 && (
                    <button type="button" onClick={() => removeDoc(i)} className="ml-auto rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-300">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            {docs.length < 4 && (
              <button type="button" onClick={addDoc} className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                + Add another
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || loading}
              className="rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </form>

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Payout destination</h2>
            {fundAccount?.registeredWithRazorpayX && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Registered with RazorpayX
              </span>
            )}
          </div>
          {fundAccount ? (
            <p className="mt-3 text-sm text-slate-300">
              {fundAccount.method === 'vpa'
                ? <>UPI VPA: <span className="font-mono text-white">{fundAccount.vpa}</span></>
                : <>Bank a/c ending <span className="font-mono text-white">{fundAccount.accountLast4}</span> • IFSC <span className="font-mono text-white">{fundAccount.ifsc}</span></>}
              {' — '}beneficiary {fundAccount.beneficiaryName}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No payout destination registered yet. Escrow release cannot send you money until you add one.</p>
          )}
        </div>

        <form onSubmit={submitFa} className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">{fundAccount ? 'Update destination' : 'Add destination'}</h2>

          <div className="mt-4 flex gap-3">
            {['vpa', 'bank'].map((m) => (
              <label key={m} className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs uppercase tracking-wider ${fa.method === m ? 'border-orange-400 bg-orange-500/10 text-orange-300' : 'border-slate-600 text-slate-300'}`}>
                <input type="radio" name="method" value={m} checked={fa.method === m} onChange={() => setFa({ ...fa, method: m })} className="hidden" />
                {m === 'vpa' ? 'UPI (VPA)' : 'Bank account'}
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {fa.method === 'vpa' ? (
              <label className="text-xs text-slate-400 sm:col-span-2">
                VPA (e.g. name@okhdfc)
                <input
                  type="text"
                  value={fa.vpa}
                  onChange={(e) => setFa({ ...fa, vpa: e.target.value })}
                  required
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ) : (
              <>
                <label className="text-xs text-slate-400">
                  Account number
                  <input
                    type="text"
                    value={fa.accountNumber}
                    onChange={(e) => setFa({ ...fa, accountNumber: e.target.value })}
                    required
                    pattern="[0-9]{6,20}"
                    className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  IFSC
                  <input
                    type="text"
                    value={fa.ifsc}
                    onChange={(e) => setFa({ ...fa, ifsc: e.target.value })}
                    required
                    className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm uppercase text-white"
                  />
                </label>
              </>
            )}
            <label className="text-xs text-slate-400 sm:col-span-2">
              Beneficiary name (exactly as on account)
              <input
                type="text"
                value={fa.beneficiaryName}
                onChange={(e) => setFa({ ...fa, beneficiaryName: e.target.value })}
                required
                className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save destination'}
          </button>
        </form>
      </section>
    </main>
  );
}
