import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function GstBilling() {
  const token = useSelector((state) => state.auth.token);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/gst/invoices`, {
      headers: {
        Authorization: `Bearer ${token || 'demo-token'}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to fetch invoices');
        }
        return response.json();
      })
      .then((data) => setInvoices(data.invoices || []))
      .catch((err) => setError(err.message));
  }, [token]);

  const handleDownloadPDF = async (invoiceId) => {
    try {
      setDownloading(invoiceId);
      const response = await fetch(`${API_URL}/api/gst/download/${invoiceId}`, {
        headers: {
          Authorization: `Bearer ${token || 'demo-token'}`,
        },
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">GST Billing</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">GST invoice management</h1>
        <p className="mt-4 text-slate-300">Generate and download compliant invoices with CGST, SGST, IGST and HSN support.</p>

        <div className="mt-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-300">
          <p className="text-sm">{token ? 'Authenticated invoice view enabled.' : 'Viewing demo GST invoices in public preview mode.'}</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 shadow-xl shadow-slate-950/20">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Invoice ledger</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Latest GST invoices</h2>
            </div>
            <button className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-400">
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
              {error ? (
                <tr>
                  <td colSpan="6" className="px-6 py-6 text-sm text-orange-300">
                    {error}
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-6 text-sm text-slate-400">
                    Loading invoices…
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-900/80">
                    <td className="px-6 py-4 text-sm text-white">{invoice.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">{invoice.shipper}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">₹{invoice.value.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">₹{invoice.cgst.toLocaleString('en-IN')} + ₹{invoice.sgst.toLocaleString('en-IN')} + ₹{invoice.igst.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-emerald-300">{invoice.status}</td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleDownloadPDF(invoice.id)}
                        disabled={downloading === invoice.id}
                        className="rounded-full bg-orange-500 px-4 py-2 text-white transition hover:bg-orange-400 disabled:opacity-50"
                      >
                        {downloading === invoice.id ? 'Downloading...' : 'Download'}
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
