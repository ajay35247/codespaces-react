import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

/**
 * CommandPalette — ⌘K / Ctrl+K global search & command runner for the admin shell.
 *
 * Pure UI: it does not fetch anything. Parent (`AdminControlPanel`) passes in
 * the data it has already loaded (users / offers / plans / auditLogs / nav)
 * plus the action callbacks. This keeps it synchronous, fast, and side-effect
 * free until the operator chooses an item.
 *
 * Result groups (in order):
 *   1. Commands           — built-in actions (Stop all offers, Start sale, …)
 *   2. Pages              — sidebar nav targets
 *   3. Users              — by email / name (max 5)
 *   4. Offers             — by name / coupon code (max 5)
 *   5. Plans              — by code / name (max 5)
 *   6. Recent audit log   — last 5 entries matching by action
 *
 * Keyboard:
 *   Esc            — close
 *   ArrowDown/Up   — move selection (wraps)
 *   Enter          — run selected
 *   Tab            — does nothing special, prevented to keep focus in input
 *
 * Why no fuzzy library: the dataset is small (<1k items typical) and a plain
 * lowercase substring match keeps matches predictable for keyboard-driven
 * operators. We rank by (a) prefix match, then (b) substring index.
 */

function score(haystack, needle) {
  if (!needle) return 0;
  const h = (haystack || '').toLowerCase();
  const idx = h.indexOf(needle);
  if (idx === -1) return -1;
  // Lower is better; prefix matches win.
  return idx === 0 ? 0 : idx + 1;
}

function rank(items, needle, getFields, max = 5) {
  if (!needle) return items.slice(0, max);
  const scored = [];
  for (const it of items) {
    const fields = getFields(it).filter(Boolean);
    let best = -1;
    for (const f of fields) {
      const s = score(f, needle);
      if (s !== -1 && (best === -1 || s < best)) best = s;
    }
    if (best !== -1) scored.push({ it, s: best });
  }
  scored.sort((a, b) => a.s - b.s);
  return scored.slice(0, max).map((x) => x.it);
}

export function CommandPalette({
  open,
  onClose,
  isDark = true,
  nav = [],
  users = [],
  offers = [],
  plans = [],
  auditLogs = [],
  onNavigate,
  onStopAllOffers,
  onStartSale,
  onToggleTheme,
}) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset state every time the palette opens so each invocation feels fresh.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setBusy(false);
      // Focus on next tick — the modal needs to be in the DOM first.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const q = query.trim().toLowerCase();

  // ── Built-in commands ────────────────────────────────────────────────
  // We expose a `match` string that's searched alongside the visible label,
  // so e.g. typing "kill" also surfaces "Stop all offers".
  const commands = useMemo(() => {
    const list = [];
    if (typeof onStopAllOffers === 'function') {
      list.push({
        id: 'cmd:stop-all-offers',
        label: 'Stop all offers (kill switch)',
        hint: 'Disables every active subscription offer/coupon platform-wide',
        match: 'stop all offers kill switch panic emergency disable',
        intent: 'danger',
        run: async () => {
          setBusy(true);
          try { await onStopAllOffers(); } finally { setBusy(false); onClose?.(); }
        },
      });
    }
    if (typeof onStartSale === 'function') {
      // Try to parse "<n>" or "<n>%" or "start sale 30" → seed discountPercent.
      const m = q.match(/(\d{1,2})\s*%?/);
      const pct = m ? Math.min(90, Math.max(1, parseInt(m[1], 10))) : null;
      list.push({
        id: 'cmd:start-sale',
        label: pct ? `Start sale (${pct}% off)` : 'Start a sale (open offer composer)',
        hint: 'Opens the Offers tab — review plans before publishing',
        match: 'start sale launch promotion discount festival',
        run: () => { onStartSale(pct); onClose?.(); },
      });
    }
    if (typeof onToggleTheme === 'function') {
      list.push({
        id: 'cmd:theme',
        label: 'Toggle theme (dark / light)',
        hint: 'Persists to localStorage',
        match: 'theme dark light mode toggle appearance',
        run: () => { onToggleTheme(); onClose?.(); },
      });
    }
    if (!q) return list;
    return list.filter((c) => score(`${c.label} ${c.match}`, q) !== -1);
  }, [q, onStopAllOffers, onStartSale, onToggleTheme, onClose]);

  // ── Searchable result groups ────────────────────────────────────────
  const navResults = useMemo(
    () => rank(nav, q, (n) => [n.label, n.key], 8),
    [nav, q],
  );

  const userResults = useMemo(
    () => rank(users, q, (u) => [u.email, u.name, u.phone]),
    [users, q],
  );

  const offerResults = useMemo(
    () => rank(offers, q, (o) => [o.name, o.label, o.couponCode]),
    [offers, q],
  );

  const planResults = useMemo(
    () => rank(plans, q, (p) => [p.code, p.name]),
    [plans, q],
  );

  // Audit log: only show if user actively typed — avoids noisy default view.
  const auditResults = useMemo(() => {
    if (!q) return [];
    return rank(auditLogs, q, (a) => [a.action, a.targetType, a.adminEmail], 5);
  }, [auditLogs, q]);

  // Flatten into a single ordered list of selectable rows for keyboard nav.
  const rows = useMemo(() => {
    const out = [];
    if (commands.length) {
      out.push({ kind: 'header', label: 'Commands' });
      for (const c of commands) {
        out.push({ kind: 'command', cmd: c });
      }
    }
    if (navResults.length) {
      out.push({ kind: 'header', label: 'Pages' });
      for (const n of navResults) {
        out.push({
          kind: 'page',
          label: n.label,
          icon: n.icon,
          run: () => { onNavigate?.(n.key); onClose?.(); },
        });
      }
    }
    if (userResults.length) {
      out.push({ kind: 'header', label: `Users (${userResults.length})` });
      for (const u of userResults) {
        out.push({
          kind: 'user',
          label: u.email || u.name || u._id,
          sub: [u.role, u.status, u.subscriptionPlan].filter(Boolean).join(' · '),
          run: () => { onNavigate?.('users'); onClose?.(); },
        });
      }
    }
    if (offerResults.length) {
      out.push({ kind: 'header', label: `Offers (${offerResults.length})` });
      for (const o of offerResults) {
        out.push({
          kind: 'offer',
          label: o.name || o.label || o.couponCode || o.id,
          sub: [o.type, o.couponCode, o.enabled ? 'live' : 'paused', `${o.discountPercent ?? '?'}% off`]
            .filter(Boolean).join(' · '),
          run: () => { onNavigate?.('offers'); onClose?.(); },
        });
      }
    }
    if (planResults.length) {
      out.push({ kind: 'header', label: `Plans (${planResults.length})` });
      for (const p of planResults) {
        out.push({
          kind: 'plan',
          label: p.name || p.code,
          sub: [p.code, p.priceMonthly != null ? `₹${p.priceMonthly}/mo` : null]
            .filter(Boolean).join(' · '),
          run: () => { onNavigate?.('overview'); onClose?.(); },
        });
      }
    }
    if (auditResults.length) {
      out.push({ kind: 'header', label: 'Audit log' });
      for (const a of auditResults) {
        out.push({
          kind: 'audit',
          label: a.action,
          sub: [a.adminEmail, a.targetType, a.createdAt && new Date(a.createdAt).toLocaleString()]
            .filter(Boolean).join(' · '),
          run: () => { onNavigate?.('audit'); onClose?.(); },
        });
      }
    }
    return out;
  }, [commands, navResults, userResults, offerResults, planResults, auditResults, onNavigate, onClose]);

  // Indices that are actually selectable (i.e. not headers).
  const selectableIdxs = useMemo(
    () => rows.map((r, i) => (r.kind === 'header' ? -1 : i)).filter((i) => i !== -1),
    [rows],
  );

  // Clamp selection whenever the result set changes.
  useEffect(() => {
    if (selectableIdxs.length === 0) {
      setSelectedIdx(0);
      return;
    }
    if (!selectableIdxs.includes(selectedIdx)) {
      setSelectedIdx(selectableIdxs[0]);
    }
  }, [selectableIdxs, selectedIdx]);

  const moveSelection = useCallback((delta) => {
    if (selectableIdxs.length === 0) return;
    const cur = selectableIdxs.indexOf(selectedIdx);
    const nextPos = (cur + delta + selectableIdxs.length) % selectableIdxs.length;
    setSelectedIdx(selectableIdxs[nextPos]);
  }, [selectableIdxs, selectedIdx]);

  const runSelected = useCallback(() => {
    const row = rows[selectedIdx];
    if (!row || row.kind === 'header') return;
    if (row.kind === 'command') {
      row.cmd.run();
    } else if (typeof row.run === 'function') {
      row.run();
    }
  }, [rows, selectedIdx]);

  // Scroll the selected row into view when keyboard-navigating.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-row-idx="${selectedIdx}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, open]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); runSelected(); return; }
    if (e.key === 'Tab') { e.preventDefault(); moveSelection(e.shiftKey ? -1 : 1); }
  };

  // Theming — keep the modal high-contrast in both modes.
  const overlayBg = 'bg-slate-950/60';
  const panelBg = isDark ? 'bg-slate-900 text-slate-100 border-white/10' : 'bg-white text-slate-900 border-slate-200';
  const inputCls = isDark
    ? 'bg-transparent text-slate-100 placeholder-slate-500'
    : 'bg-transparent text-slate-900 placeholder-slate-400';
  const headerCls = isDark ? 'text-slate-500' : 'text-slate-400';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] ${overlayBg}`}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={`w-full max-w-xl rounded-2xl border shadow-2xl ${panelBg}`}>
        <div className="flex items-center gap-2 border-b border-current/10 px-3 py-2">
          <span aria-hidden className="text-base opacity-60">⌕</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search users, offers, plans · type a command…"
            className={`w-full border-0 px-1 py-1.5 text-sm focus:outline-none focus:ring-0 ${inputCls}`}
            aria-label="Command palette search"
            // Disable browser autofill / suggestions which interfere with the palette.
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={`hidden sm:inline rounded px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm opacity-60">No matches.</p>
          )}
          {rows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={`h-${i}`}
                  className={`px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${headerCls}`}
                >
                  {row.label}
                </div>
              );
            }
            const isSel = i === selectedIdx;
            const baseCls = isSel
              ? (isDark ? 'bg-cyan-500/15 text-cyan-100' : 'bg-cyan-50 text-cyan-900')
              : 'hover:bg-current/[0.05]';
            const dangerCls = row.kind === 'command' && row.cmd.intent === 'danger'
              ? (isSel ? 'text-rose-200' : 'text-rose-400')
              : '';
            const label = row.kind === 'command' ? row.cmd.label : row.label;
            const sub = row.kind === 'command' ? row.cmd.hint : row.sub;
            return (
              <button
                key={`r-${i}`}
                data-row-idx={i}
                type="button"
                disabled={busy}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={runSelected}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${baseCls} ${dangerCls}`}
              >
                <div className="min-w-0">
                  <div className="truncate">{label}</div>
                  {sub && <div className="truncate text-[11px] opacity-60">{sub}</div>}
                </div>
                {isSel && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider opacity-60">↵</span>
                )}
              </button>
            );
          })}
        </div>

        <div className={`flex items-center justify-between border-t border-current/10 px-3 py-1.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <span>↑↓ navigate · ↵ select · Esc close</span>
          {busy && <span>Working…</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook: registers a global ⌘K / Ctrl+K shortcut that calls `onOpen`. Also
 * intercepts the `/` key when no input is focused, matching the convention of
 * GitHub, Linear, Slack, etc. Returns nothing — purely a side effect.
 */
export function useCommandPaletteShortcut(onOpen) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof onOpen !== 'function') return undefined;
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onOpen();
        return;
      }
      // "/" opens the palette, but only when the user isn't typing into a
      // text field — otherwise we'd hijack normal text entry.
      if (e.key === '/' && !isMod) {
        const t = e.target;
        const tag = t && t.tagName;
        const editable = t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
        if (!editable) {
          e.preventDefault();
          onOpen();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
