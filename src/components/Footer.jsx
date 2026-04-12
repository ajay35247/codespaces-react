import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/95 px-6 py-10 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Speedy Trucks</p>
          <p className="max-w-xl text-sm leading-6 text-slate-300">
            India-first logistics and freight management platform with GPS tracking, GST billing, and role-based workflows.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Platform</p>
            <Link className="block hover:text-white" to="/privacy">Privacy Policy</Link>
            <Link className="block hover:text-white" to="/terms">Terms & Conditions</Link>
            <Link className="block hover:text-white" to="/contact">Contact / Support</Link>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Services</p>
            <Link className="block hover:text-white" to="/payment">Payments</Link>
            <Link className="block hover:text-white" to="/subscription">Subscription</Link>
            <Link className="block hover:text-white" to="/faq">FAQ</Link>
          </div>
        </div>
      </div>
      <div className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-500">
        © {new Date().getFullYear()} Speedy Trucks. Built for the Indian logistics economy.
      </div>
    </footer>
  );
}
