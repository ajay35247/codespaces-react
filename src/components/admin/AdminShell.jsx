import { useEffect, useState, useCallback } from 'react';

/**
 * AdminShell — three-column workspace layout.
 *
 *   ┌────────┬──────────────────────────┬────────┐
 *   │        │  TopBar (sticky)         │        │
 *   │ Side   ├──────────────────────────┤ Right  │
 *   │ bar    │  Main workspace (kids)   │ panel  │
 *   │        │                          │ (col)  │
 *   └────────┴──────────────────────────┴────────┘
 *
 * - Sidebar: 240px expanded, 64px collapsed (icon-only). Persisted in
 *   localStorage so admins don't re-collapse on every page load.
 * - Right panel: 320px collapsible. Same persistence.
 * - Theme: dark (default) / light, persisted to localStorage and applied as
 *   a class on the shell root so Tailwind's `dark:` variants take effect.
 *
 * The shell is intentionally dependency-free (no router context required) —
 * it just receives `nav`, `activeKey`, `onNavigate`, `topBar`, `rightPanel`,
 * `fab`, and renders children. This keeps it usable from any container.
 */

const LS_SIDEBAR_KEY = 'admin.shell.sidebar.collapsed';
const LS_RIGHT_KEY = 'admin.shell.right.collapsed';
const LS_THEME_KEY = 'admin.shell.theme';

function readBool(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return v === null ? fallback : v === '1';
}

function writeBool(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value ? '1' : '0');
}

function readTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(LS_THEME_KEY) || 'dark';
}

export function AdminShell({
  nav = [],
  activeKey,
  onNavigate,
  topBar,
  rightPanel,
  fab,
  children,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readBool(LS_SIDEBAR_KEY, false));
  const [rightCollapsed, setRightCollapsed] = useState(() => readBool(LS_RIGHT_KEY, false));
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => { writeBool(LS_SIDEBAR_KEY, sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => { writeBool(LS_RIGHT_KEY, rightCollapsed); }, [rightCollapsed]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const isDark = theme === 'dark';
  const rootBg = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  const panelBg = isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200';
  const sidebarBg = isDark ? 'bg-slate-950 border-white/5' : 'bg-white border-slate-200';

  const sidebarWidth = sidebarCollapsed ? 'w-16' : 'w-60';
  const rightWidth = rightCollapsed ? 'w-10' : 'w-80';

  return (
    <div className={`${theme} flex min-h-screen ${rootBg}`} data-admin-shell>
      <aside className={`${sidebarBg} ${sidebarWidth} sticky top-0 flex h-screen flex-col border-r transition-[width] duration-150`}>
        <div className="flex h-14 items-center justify-between px-3">
          {!sidebarCollapsed && (
            <span className={`text-sm font-semibold tracking-wide ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              Control Tower
            </span>
          )}
          <button
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={`ml-auto rounded p-1 text-xs ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {nav.map((item) => {
            const active = item.key === activeKey;
            const baseClass = active
              ? (isDark ? 'bg-cyan-500/15 text-cyan-200' : 'bg-cyan-50 text-cyan-800')
              : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100');
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.(item.key)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${baseClass}`}
              >
                <span className="text-base leading-none" aria-hidden>{item.icon || '•'}</span>
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {!sidebarCollapsed && item.badge != null && (
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur ${isDark ? 'bg-slate-950/80 border-white/5' : 'bg-white/80 border-slate-200'}`}>
          {typeof topBar === 'function' ? topBar({ theme, toggleTheme, isDark }) : topBar}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={`ml-auto rounded-lg px-2.5 py-1.5 text-sm ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {isDark ? '☀' : '🌙'}
          </button>
        </header>

        <main className={`flex-1 overflow-x-hidden p-4 sm:p-6 ${isDark ? '' : 'bg-slate-50'}`}>
          <div className={`mx-auto max-w-7xl rounded-2xl border ${panelBg} p-4 sm:p-6 shadow-sm`}>
            {children}
          </div>
        </main>
      </div>

      {rightPanel && (
        <aside className={`${panelBg} ${rightWidth} sticky top-0 hidden h-screen border-l transition-[width] duration-150 lg:block`}>
          <div className="flex h-14 items-center justify-between border-b border-inherit px-3">
            {!rightCollapsed && (
              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Insights
              </span>
            )}
            <button
              type="button"
              aria-label={rightCollapsed ? 'Expand insights' : 'Collapse insights'}
              onClick={() => setRightCollapsed((v) => !v)}
              className={`ml-auto rounded p-1 text-xs ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {rightCollapsed ? '«' : '»'}
            </button>
          </div>
          {!rightCollapsed && (
            <div className="h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
              {typeof rightPanel === 'function' ? rightPanel({ theme, isDark }) : rightPanel}
            </div>
          )}
        </aside>
      )}

      {fab && <div className="fixed bottom-6 right-6 z-20">{fab}</div>}
    </div>
  );
}

/* ── Reusable building blocks for pages built on the shell ─────────── */

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-current/10 pb-3">
      <div>
        <h1 className="text-xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm opacity-70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, delta, intent = 'neutral' }) {
  const intentClass = {
    up:      'text-emerald-500',
    down:    'text-rose-500',
    neutral: 'opacity-70',
  }[intent] || 'opacity-70';
  return (
    <div className="rounded-xl border border-current/10 bg-current/[0.03] p-4">
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {delta != null && <p className={`mt-1 text-xs ${intentClass}`}>{delta}</p>}
    </div>
  );
}

export function FilterBar({ children }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>
  );
}
