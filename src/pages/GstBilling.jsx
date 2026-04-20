import { useEffect, useState } from 'react';
import { buildApiUrl, apiRequest } from '../utils/api';

function CreateInvoiceForm({ onCreated }) {
  const [form, setForm] = useState({
    shipper: '', shipperGstin: '', value: '', hsn: '', supplyType: 'intra', loadId: '',
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
        shipper: form.shipper.trim(),
        supplyType: form.supplyType,
        value: parseFloat(form.value),
      };
      if (form.shipperGstin) body.shipperGstin = form.shipperGstin.trim();
      if (form.hsn) body.hsn = form.hsn.trim();
      if (form.loadId) body.loadId = form.loadId.trim();

      const data = await apiRequest('/gst/invoices', { method: 'POST', body });
      setSuccess(`Invoice ${data.invoice?.invoiceNumber} created.`);
      setForm({ shipper: '', shipperGstin: '', value: '', hsn: '', supplyType: 'intra', loadId: '' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Shipper Name *</label>
        <input
          name="shipper"
          value={form.shipper}
          onChange={handleChange}
          placeholder="Company or individual name"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Freight Value (₹) *</label>
        <input
          name="value"
          type="number"
          min="1"
          step="0.01"
          value={form.value}
          onChange={handleChange}
          placeholder="e.g. 50000"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Supply Type</label>
        <select
          name="supplyType"
          value={form.supplyType}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="intra">Intra-state (CGST + SGST)</option>
          <option value="inter">Inter-state (IGST)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Shipper GSTIN</label>
        <input
          name="shipperGstin"
          value={form.shipperGstin}
          onChange={handleChange}
          placeholder="27AAPCU9603R1Z0"
          maxLength={15}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">HSN Code</label>
        <input
          name="hsn"
          value={form.hsn}
          onChange={handleChange}
          placeholder="9965 (default)"
          maxLength={10}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Load ID (optional)</label>
        <input
          name="loadId"
          value={form.loadId}
          onChange={handleChange}
          placeholder="L-XXX-XXX"
          maxLength={128}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Invoice'}
        </button>
        {error && <p className="text-sm text-orange-300">{error}</p>}
        {success && <p className="text-sm text-emerald-300">{success}</p>}
      </div>
    </form>
  );
}

export function GstBilling() {
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const loadInvoices = () => {
    setLoading(true);
    fetch(buildApiUrl('/gst/invoices'), { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to fetch invoices');
        return response.json();
      })
      .then((data) => {
        setInvoices(data.invoices || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleDownloadPDF = async (invoiceId) => {
    try {
      setDownloading(invoiceId);
      const response = await fetch(buildApiUrl(`/gst/download/${invoiceId}`), {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download invoice');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) return;
    const headers = ['Invoice No', 'Shipper', 'Value', 'CGST', 'SGST', 'IGST', 'HSN', 'Status', 'Date'];
    const rows = invoices.map((inv) => [
      inv.invoiceNumber || inv._id,
      `"${(inv.shipper || '').replace(/"/g, '""')}"`,
      inv.value,
      inv.cgst,
      inv.sgst,
      inv.igst,
      inv.hsn || '',
      inv.status,
      inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gst-invoices-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-orange-300">GST Billing</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">GST invoice management</h1>
            <p className="mt-4 text-slate-300">Generate and download compliant invoices with CGST, SGST, IGST and HSN support.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
          >
            {showForm ? 'Cancel' : '+ Create Invoice'}
          </button>
        </div>

        {showForm && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <h2 className="text-lg font-semibold text-white">New GST invoice</h2>
            <CreateInvoiceForm onCreated={() => { setShowForm(false); loadInvoices(); }} />
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 shadow-xl shadow-slate-950/20">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Invoice ledger</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Latest GST invoices</h2>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={invoices.length === 0}
              className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>

          <table className="min-w-full divide-y divide-white/10 text-left">
            <thead className="bg-slate-950/80 text-slate-400">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold uppercase">Invoice</th>
                <th className="px-6 py-4 text-sm font-semibold uppercase">Shipper</th>
                <th className="px-6 py-4 text-sm font-semibold uppercase">Value</th>
                <th className="px-6 py-4 text-sm font-semibold uppercase">GST</th>
                <th className="px-6 py-4 text-sm font-semibold uppercase">Status</th>
                <th className="px-6 py-4 text-sm font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-slate-950/90">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-6 text-sm text-slate-400">Loading invoices…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" className="px-6 py-6 text-sm text-orange-300">{error}</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-6 text-sm text-slate-400">
                    No invoices yet. Click &ldquo;Create Invoice&rdquo; above to generate your first invoice.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice._id} className="hover:bg-slate-900/80">
                    <td className="px-6 py-4 text-sm text-white">{invoice.invoiceNumber || invoice._id}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">{invoice.shipper}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">₹{invoice.value.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">
                      {invoice.igst > 0
                        ? `IGST: ₹${invoice.igst.toLocaleString('en-IN')}`
                        : `CGST: ₹${invoice.cgst.toLocaleString('en-IN')} + SGST: ₹${invoice.sgst.toLocaleString('en-IN')}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-emerald-300">{invoice.status}</td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleDownloadPDF(invoice._id)}
                        disabled={downloading === invoice._id}
                        className="rounded-full bg-orange-500 px-4 py-2 text-white transition hover:bg-orange-400 disabled:opacity-50"
                      >
                        {downloading === invoice._id ? 'Downloading...' : 'Download PDF'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
