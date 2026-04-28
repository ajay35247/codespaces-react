/**
 * ComparisonTable — feature-by-feature ✓/✗ grid below the plan cards.
 *
 * Mobile (<sm): collapses into per-plan accordions (handled at parent
 * via tailwind responsive utilities); the desktop table is hidden on
 * narrow screens and replaced by a stacked summary.
 *
 * The first column is sticky on horizontal scroll so feature names stay
 * visible while users scan tiers — important on tablets with narrow
 * viewports.
 */

const ROWS = [
  { label: 'Loads per day',         key: 'loadsPerDay',        type: 'number' },
  { label: 'Bids per day',          key: 'bidsPerDay',         type: 'number' },
  { label: 'Priority visibility',   key: 'priorityVisibility', type: 'bool'   },
  { label: 'Fast load matching',    key: 'fastMatching',       type: 'bool'   },
  { label: 'Premium badge',         key: 'premiumBadge',       type: 'bool'   },
  { label: 'AI matching',           key: 'aiMatching',         type: 'bool'   },
  { label: 'Advanced analytics',    key: 'advancedAnalytics',  type: 'bool'   },
  { label: 'Wallet withdrawals',    key: 'walletWithdrawals',  type: 'bool'   },
  { label: 'Priority support',      key: 'prioritySupport',    type: 'bool'   },
  { label: 'Ads',                   key: 'adsEnabled',         type: 'bool', invert: true, label2: 'No ads' },
];

function renderCell(value, type, invert) {
  if (type === 'number') {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number' && value < 0) return 'Unlimited';
    return String(value);
  }
  // bool — invert flips the meaning (e.g. ads enabled = bad).
  const truthy = Boolean(value);
  const positive = invert ? !truthy : truthy;
  return positive ? (
    <span className="text-emerald-400" aria-label="yes">✓</span>
  ) : (
    <span className="text-slate-600" aria-label="no">—</span>
  );
}

export function ComparisonTable({ plans }) {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/60">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left">
            <th className="sticky left-0 z-10 bg-slate-900/95 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              Compare features
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                className={`px-4 py-3 text-center text-xs uppercase tracking-[0.2em] ${
                  plan.highlight === 'best-value' ? 'text-orange-300' : 'text-slate-300'
                }`}
              >
                {plan.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, idx) => (
            <tr
              key={row.key}
              className={idx % 2 === 0 ? 'bg-slate-950/40' : 'bg-transparent'}
            >
              <td className="sticky left-0 z-10 bg-inherit px-4 py-3 text-slate-300">
                {row.invert ? row.label2 : row.label}
              </td>
              {plans.map((plan) => (
                <td
                  key={plan.id + row.key}
                  className={`px-4 py-3 text-center ${
                    plan.highlight === 'best-value' ? 'text-orange-100' : 'text-slate-200'
                  }`}
                >
                  {renderCell(plan.features?.[row.key], row.type, row.invert)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ComparisonTable;
