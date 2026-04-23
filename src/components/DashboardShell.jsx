import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { SmartNav } from './SmartNav';
import { LiveActivityRail } from './LiveActivityRail';

/**
 * DashboardShell – Unified 3-column layout for all authenticated dashboard views.
 *
 * ┌──────────┬─────────────────────────────────┬──────────────┐
 * │ SmartNav │  children (page content)         │ LiveRail     │
 * │ (left)   │                                  │ (right)      │
 * └──────────┴─────────────────────────────────┴──────────────┘
 *
 * - SmartNav is collapsible: 240 px expanded → 64 px icon-only
 * - LiveActivityRail is collapsible on xl+ screens; hidden on smaller viewports
 * - On mobile/tablet a top bar with hamburger replaces the left nav
 *
 * Props:
 *   children      – the page content rendered in the center column
 *   hideLiveRail  – set true for focused pages (e.g. DriverLive GPS map)
 */
export function DashboardShell({ children, hideLiveRail = false }) {
  const user = useSelector((s) => s.auth.user);
  const [navExpanded, setNavExpanded] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Without an authenticated user the shell renders a minimal skeleton so the
  // ProtectedRoute redirect can complete without a flash of unstyled content.
  if (!user) {
    return <div className="min-h-screen bg-slate-950">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* ════ Mobile nav overlay ════ */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            key="mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ════ Mobile slide-in nav drawer ════ */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.aside
            key="mobile-nav"
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r border-white/5 bg-slate-950 backdrop-blur-xl lg:hidden"
          >
            <SmartNav
              expanded
              onToggle={() => setMobileNavOpen(false)}
              mobileClose
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ════ Desktop left nav ════ */}
      <motion.aside
        initial={false}
        animate={{ width: navExpanded ? 240 : 64 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="hidden lg:flex shrink-0 flex-col border-r border-white/5 bg-slate-950/95 backdrop-blur-xl relative z-20 overflow-hidden"
      >
        <SmartNav
          expanded={navExpanded}
          onToggle={() => setNavExpanded((v) => !v)}
        />
      </motion.aside>

      {/* ════ Center workspace ════ */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between border-b border-white/5 bg-slate-950/90 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition"
            aria-label="Open navigation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <span className="text-sm font-bold text-white tracking-wide">Speedy Trucks</span>

          {!hideLiveRail && (
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition"
              aria-label="Toggle activity panel"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          )}
        </div>

        {/* Page content – independently scrollable */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      {/* ════ Desktop right live activity rail ════ */}
      {!hideLiveRail && (
        <>
          <AnimatePresence initial={false}>
            {railOpen && (
              <motion.aside
                key="rail"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="hidden xl:flex shrink-0 flex-col border-l border-white/5 bg-slate-950/90 backdrop-blur-xl overflow-hidden"
              >
                <LiveActivityRail onClose={() => setRailOpen(false)} />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Expand button when rail is closed */}
          {!railOpen && (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 z-20 items-center justify-center rounded-l-xl border border-r-0 border-white/10 bg-slate-900/90 p-2 text-slate-400 hover:text-white transition"
              aria-label="Open activity rail"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
