import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ROLE_CARDS } from '../data/roles';
import { RoleCard } from '../components/RoleCard';

// Heavy (~500KB) three.js + fiber bundle — only parsed when the Home
// page actually mounts, and further deferred via Suspense so it never
// blocks the hero's text LCP.  Dashboard pages don't import this.
const Hero3DScene = lazy(() => import('../components/Hero3DScene'));

/* ── Static platform stats shown in the hero ticker ──────────────── */
const PLATFORM_STATS = [
  { label: 'Active Loads',     value: '12,480', icon: '📦', color: 'text-cyan-400'    },
  { label: 'Fleet Vehicles',   value: '8,320',  icon: '🚛', color: 'text-orange-400'  },
  { label: 'Deliveries Today', value: '3,940',  icon: '✅', color: 'text-emerald-400' },
  { label: 'GST Invoiced',     value: '₹2.4Cr', icon: '🧾', color: 'text-violet-400'  },
];

/* ── Platform feature highlights ─────────────────────────────────── */
const FEATURES = [
  {
    icon: '📦', title: 'Freight Marketplace',
    description: 'AI load-matching with real-time bidding, escrow payments and digital contracts.',
    border: 'border-cyan-500/20',    bg: 'from-cyan-500/15 to-sky-500/5',
  },
  {
    icon: '📍', title: 'Real-Time GPS Tracking',
    description: 'Track every truck across India with live coordinates, route replay and ETA.',
    border: 'border-orange-500/20',  bg: 'from-orange-500/15 to-amber-500/5',
  },
  {
    icon: '🧾', title: 'GST Compliance',
    description: 'Auto-generate GST invoices, CGST/IGST calculations and one-click PDF export.',
    border: 'border-emerald-500/20', bg: 'from-emerald-500/15 to-green-500/5',
  },
  {
    icon: '🤖', title: 'AI Dispatch Engine',
    description: 'Smart route optimisation, fraud detection and autonomous driver assignment.',
    border: 'border-violet-500/20',  bg: 'from-violet-500/15 to-purple-500/5',
  },
  {
    icon: '⚡', title: 'FASTag & Tolls',
    description: 'Integrated FASTag wallet management, toll recharges and transaction history.',
    border: 'border-amber-500/20',   bg: 'from-amber-500/15 to-yellow-500/5',
  },
  {
    icon: '🛡️', title: 'Enterprise Security',
    description: 'MFA, role-based access, audit logging and admin-controlled kill-switches.',
    border: 'border-rose-500/20',    bg: 'from-rose-500/15 to-pink-500/5',
  },
];

/* ── Animated mesh-gradient background ───────────────────────────── */
function HeroBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="mesh-orb-1 absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="mesh-orb-2 absolute top-8 -right-16 h-[28rem] w-[28rem] rounded-full bg-orange-500/8 blur-3xl" />
      <div className="mesh-orb-3 absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/8 blur-3xl" />
      <div className="perspective-grid absolute inset-0 opacity-70" />
      <div className="scanlines absolute inset-0 opacity-30" />
    </div>
  );
}

/* ── Floating 3D command-center card (hero right side) ───────────── */
function CommandCenter() {
  return (
    <div style={{ perspective: '1200px', perspectiveOrigin: '50% 40%' }}>
      <motion.div
        initial={{ opacity: 0, y: 48, rotateX: 22 }}
        animate={{ opacity: 1, y: 0, rotateX: 5 }}
        transition={{ duration: 1.3, ease: [0.23, 1, 0.32, 1] }}
        className="float-3d relative mx-auto max-w-[22rem]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Depth shadow layers */}
        <div
          className="absolute inset-0 rounded-3xl border border-cyan-500/20 bg-cyan-500/5"
          style={{ transform: 'translateZ(-28px) scale(0.93)' }}
        />
        <div
          className="absolute inset-0 rounded-3xl border border-white/8 bg-slate-900/40"
          style={{ transform: 'translateZ(-12px) scale(0.97)' }}
        />

        {/* Main panel */}
        <div className="relative rounded-3xl border border-white/15 bg-slate-950/92 p-5 shadow-2xl backdrop-blur-2xl">
          {/* Header bar */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="live-dot h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Live Operations</span>
            </div>
            <span className="rounded-full bg-slate-800/80 px-2.5 py-1 text-[10px] text-slate-400">Speedy AI</span>
          </div>

          {/* Mini stat tiles */}
          <div className="mb-5 grid grid-cols-3 gap-2.5">
            {[
              { l: 'Loads',      v: '247', c: 'text-cyan-400'    },
              { l: 'In Transit', v: '89',  c: 'text-amber-400'   },
              { l: 'Delivered',  v: '158', c: 'text-emerald-400' },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-slate-900/90 p-3 text-center">
                <p className="mb-1 text-[10px] text-slate-500">{s.l}</p>
                <p className={`text-xl font-bold tabular-nums ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Animated road strip */}
          <div className="st-road relative h-14 overflow-hidden rounded-2xl border border-white/8">
            <div className="perspective-grid absolute inset-0 opacity-50" />
            <div className="st-road-lines" />
            <div className="st-truck" style={{ '--truck-speed': '6s' }}>
              <div className="st-cabin" />
              <div className="st-trailer" />
              <div className="st-wheel st-wheel-front" />
              <div className="st-wheel st-wheel-rear" />
            </div>
          </div>

          {/* AI progress bar */}
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-slate-900/70 px-3 py-2.5">
            <span className="text-xs font-semibold text-violet-400">AI Engine</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                initial={{ width: '0%' }}
                animate={{ width: '78%' }}
                transition={{ duration: 2, delay: 1.2, ease: 'easeOut' }}
              />
            </div>
            <span className="tabular-nums text-xs text-slate-400">78%</span>
          </div>

          {/* Route info */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: 'Mumbai → Delhi', v: 'ETA 14h 20m' },
              { l: 'Route Optimized', v: '↓ 12% fuel' },
            ].map((r) => (
              <div key={r.l} className="rounded-xl bg-slate-900/70 px-3 py-2">
                <p className="text-[10px] text-slate-500">{r.l}</p>
                <p className="mt-0.5 text-xs font-semibold text-white">{r.v}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Fade-up animation helper ─────────────────────────────────────── */
function FadeUp({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.65, ease: [0.23, 1, 0.32, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════ */
export function Home() {
  return (
    <main className="relative min-h-screen">

      {/* ─────────────────────────── HERO ─────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-16 pt-14 sm:px-10 sm:pt-20">
        <HeroBg />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">

            {/* Left: copy */}
            <div>
              <FadeUp delay={0}>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5">
                  <span className="live-dot h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                    Platform Live · 12,480 Active Loads
                  </span>
                </div>
              </FadeUp>

              <FadeUp delay={0.08}>
                <h1 className="text-5xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl xl:text-7xl">
                  India's{' '}
                  <span className="gradient-text-cyan-orange">Smartest</span>
                  <br />
                  Freight Network
                </h1>
              </FadeUp>

              <FadeUp delay={0.18}>
                <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                  AI-powered logistics connecting shippers, drivers, and brokers
                  with real-time GPS, GST billing, FASTag integration and autonomous dispatch.
                </p>
              </FadeUp>

              <FadeUp delay={0.28} className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/register"
                  className="rounded-full bg-orange-500 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:shadow-orange-400/35"
                >
                  Get Started Free →
                </a>
                <a
                  href="/login"
                  className="rounded-full border border-white/20 bg-white/5 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                >
                  Sign In
                </a>
              </FadeUp>

              {/* Stats ticker */}
              <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PLATFORM_STATS.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 + i * 0.08 }}
                    className="glass depth-card rounded-2xl p-4 text-center"
                  >
                    <div className="mb-1 select-none text-xl">{stat.icon}</div>
                    <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right: 3D hero scene (lazy-loaded R3F).  Falls back to the
                existing CSS 3D CommandCenter while the bundle loads —
                ensures the hero never paints empty space. */}
            <div className="hidden lg:block">
              <Suspense fallback={<CommandCenter />}>
                <Hero3DScene />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── FEATURES ─────────────────────── */}
      <section className="relative px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center"
          >
            <p className="mb-3 text-xs uppercase tracking-[0.32em] text-orange-300">Platform Core</p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Everything your fleet needs</h2>
            <p className="mt-4 text-slate-400">One platform, every stakeholder — built for Indian roads and regulations.</p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.5 }}
                className={`group relative rounded-3xl border ${f.border} bg-gradient-to-br ${f.bg} p-6 backdrop-blur-sm depth-card card-shine`}
              >
                <div className="absolute inset-0 rounded-3xl bg-white/0 transition-colors duration-300 group-hover:bg-white/[0.025]" />
                <div className="relative">
                  <div className="mb-4 select-none text-3xl leading-none">{f.icon}</div>
                  <h3 className="text-base font-bold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{f.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── ROLE CARDS ───────────────────── */}
      <section className="relative px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-10"
          >
            <p className="mb-3 text-xs uppercase tracking-[0.32em] text-orange-300">Choose Your Role</p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Your personalized dashboard</h2>
            <p className="mt-3 max-w-xl text-slate-400">
              Each role unlocks a purpose-built workspace with KPIs, quick-action tools and real-time data.
            </p>          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" style={{ perspective: '1200px' }}>
            {ROLE_CARDS.map((role, i) => (
              <motion.div
                key={role.key}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.10, duration: 0.55 }}
              >
                <RoleCard
                  title={role.label}
                  description={role.description}
                  gradient={role.color}
                  link={`/dashboard/${role.key}`}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── BOTTOM CTA ───────────────────── */}
      <section className="relative px-6 py-20 sm:px-10">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 p-10 text-center shadow-2xl backdrop-blur-xl card-shine">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.12),transparent_65%)]" />
          <p className="relative mb-3 text-xs uppercase tracking-[0.32em] text-cyan-400">Ready to ship smarter?</p>
          <h2 className="relative text-3xl font-black text-white">Start for free today</h2>
          <p className="relative mt-4 text-slate-400">No credit card required. Full platform access from day one.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="/register"
              className="rounded-full bg-orange-500 px-8 py-3 font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400"
            >
              Create Account →
            </a>
            <a
              href="/faq"
              className="rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Read the FAQ
            </a>
          </div>
        </div>
      </section>

    </main>
  );
}
