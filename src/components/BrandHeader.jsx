export function BrandHeader() {
  return (
    <header className="bg-[#0B3D91] text-white px-6 py-5 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between gap-3 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300">Speedy Trucks</p>
          <h1 className="text-3xl font-semibold tracking-tight">Aptrucking Logistics Command Center</h1>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-slate-200">Modern enterprise logistics for shippers, drivers, brokers, and fleet owners.</p>
          <p className="text-xs text-slate-300">Nationwide India scale · Real-time shipments · AI dispatch</p>
        </div>
      </div>
    </header>
  );
}
