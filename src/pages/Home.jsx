import { ROLE_CARDS } from '../data/roles';
import { RoleCard } from '../components/RoleCard';

export function Home() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-[2rem] bg-slate-950/80 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
          <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Core Platform</p>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white">Enterprise logistics for India’s freight economy.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            Speedy Trucks brings shippers, drivers, fleet owners and brokers together in one AI-powered logistics and tracking platform built for Indian transport and GST compliance.
          </p>
          <div className="mt-10 space-y-4 text-slate-300">
            <p>• Freight marketplace with bidding, escrow and GST billing in INR.</p>
            <p>• Real-time GPS tracking, route optimization and autonomous dispatch.</p>
            <p>• India-ready role-based analytics dashboards for every stakeholder.</p>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[2rem] bg-gradient-to-br from-sky-600 to-cyan-500 p-8 shadow-2xl shadow-sky-900/20">
            <p className="text-sm uppercase tracking-[0.28em] text-white/80">Rapid launch</p>
            <h3 className="mt-4 text-3xl font-semibold text-white">Mobile-ready design</h3>
            <p className="mt-4 text-sm leading-6 text-white/80">A modern dashboard with role-aware navigation and KPI visuals built for quick scaling.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-900/90 p-6 text-white shadow-lg shadow-slate-900/20">
              <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Realtime GPS</p>
              <p className="mt-4 text-2xl font-semibold">Live shipment status</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-6 text-white shadow-lg shadow-slate-900/20">
              <p className="text-sm uppercase tracking-[0.3em] text-orange-300">AI Engine</p>
              <p className="mt-4 text-2xl font-semibold">Load matching & pricing</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Role dashboards</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">Choose your workflow</h3>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {ROLE_CARDS.map((role) => (
            <RoleCard
              key={role.key}
              title={role.label}
              description={role.description}
              gradient={role.color}
              link={`/dashboard/${role.key}`}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
