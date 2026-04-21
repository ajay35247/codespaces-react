import { Card3D } from './Card3D';

const GLOW_CLASSES = {
  cyan:    'group-hover:bg-cyan-500/40',
  orange:  'group-hover:bg-orange-500/40',
  violet:  'group-hover:bg-violet-500/40',
  emerald: 'group-hover:bg-emerald-500/40',
  amber:   'group-hover:bg-amber-500/40',
  rose:    'group-hover:bg-rose-500/40',
  sky:     'group-hover:bg-sky-500/40',
};

const BOTTOM_LINE_CLASSES = {
  cyan:    'bg-cyan-500/60',
  orange:  'bg-orange-500/60',
  violet:  'bg-violet-500/60',
  emerald: 'bg-emerald-500/60',
  amber:   'bg-amber-500/60',
  rose:    'bg-rose-500/60',
  sky:     'bg-sky-500/60',
};

/**
 * 3D glassmorphism statistics card.
 *
 * Props
 *   label      – small uppercase label
 *   value      – primary large value (string)
 *   accent     – Tailwind text colour class applied to the value
 *   icon       – optional emoji or SVG element shown above the label
 *   subtext    – optional small caption below the value
 *   glowColor  – key into GLOW_CLASSES for mouse-radial glow (default 'cyan')
 */
export function StatsCard({ label, value, accent, icon, subtext, glowColor = 'cyan' }) {
  const bottomLine = BOTTOM_LINE_CLASSES[glowColor] || BOTTOM_LINE_CLASSES.cyan;

  return (
    <Card3D className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-sm card-shine">
      {/* Icon */}
      {icon && <div className="mb-3 text-2xl leading-none">{icon}</div>}

      {/* Label */}
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>

      {/* Value */}
      <p className={`mt-3 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>

      {/* Subtext */}
      {subtext && <p className="mt-2 text-xs text-slate-500">{subtext}</p>}

      {/* Bottom accent line — visible on hover via parent group */}
      <div className={`absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${bottomLine}`} />
    </Card3D>
  );
}

