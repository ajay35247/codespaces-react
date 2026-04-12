export function StatsCard({ label, value, accent }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm shadow-slate-900/5">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-4 text-3xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
