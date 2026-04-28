/**
 * BillingToggle — Monthly / Yearly switch.
 *
 * Uses a dual-pill design with an animated background indicator. The
 * "2 months free" badge anchors the yearly choice as the smarter
 * default (technique 8 in the pricing strategy: yearly trick).
 */
import { motion } from 'framer-motion';

export function BillingToggle({ value, onChange }) {
  const isYearly = value === 'yearly';
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div
        role="tablist"
        aria-label="Billing cycle"
        className="relative inline-flex items-center rounded-full bg-slate-800/80 p-1 shadow-inner shadow-black/40"
      >
        <motion.span
          aria-hidden="true"
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          className="absolute inset-y-1 w-1/2 rounded-full bg-orange-500 shadow"
          style={{ left: isYearly ? '50%' : '0.25rem', right: isYearly ? '0.25rem' : '50%' }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={!isYearly}
          onClick={() => onChange('monthly')}
          className={`relative z-10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
            !isYearly ? 'text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isYearly}
          onClick={() => onChange('yearly')}
          className={`relative z-10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
            isYearly ? 'text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          Yearly
        </button>
      </div>
      <p className="text-xs text-emerald-400">
        Yearly = <span className="font-semibold">2 months free</span>
      </p>
    </div>
  );
}

export default BillingToggle;
