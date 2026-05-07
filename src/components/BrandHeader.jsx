import { BrandLogo } from './BrandLogo';

export function BrandHeader() {
  return (
    <header className="bg-[#0B3D91] text-white px-6 py-5 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between gap-3 items-center">
        <div className="flex items-center gap-4">
          <BrandLogo
            variant="mark"
            size={72}
            className="rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.25)] sm:!w-20 sm:!h-20"
            title="Speedy Trucks"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Speedy Trucks</p>
            <h1 className="text-3xl font-semibold tracking-tight">Logistics Command Center</h1>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-slate-200">Modern enterprise logistics for shippers, drivers, and brokers.</p>
          <p className="text-xs text-slate-300">Nationwide India scale · Real-time shipments · AI dispatch</p>
        </div>
      </div>
    </header>
  );
}
