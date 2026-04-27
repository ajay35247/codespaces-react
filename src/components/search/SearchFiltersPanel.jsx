import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  filtersChanged,
  filtersCleared,
  filtersPanelToggled,
  createSavedSearch,
} from '../../features/search/searchSlice';

const VEHICLE_PRESETS = ['Mini Truck', 'LCV', 'Container', 'Trailer', 'Open Body', 'Reefer'];
const DISTANCE_PRESETS = [
  { value: '', label: 'Any' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'tollfree', label: 'Toll-free' },
  { value: 'highway', label: 'Highway' },
];

/**
 * SearchFiltersPanel — slide-over on desktop, bottom-sheet on mobile,
 * controlled entirely by Redux state (`filtersPanelOpen`, `filters`,
 * `filtersEnabled`).  Calls `onApply` once the user commits the form so the
 * page can re-fetch results with the new filter set.
 *
 * Filter visibility is server-driven: any chip whose backing flag is
 * `false` in `filtersEnabled` is hidden, mirroring the admin-controlled
 * `filters` map exposed by `/search`.
 */
export function SearchFiltersPanel({ onApply }) {
  const dispatch = useDispatch();
  const open = useSelector((s) => s.search.filtersPanelOpen);
  const filters = useSelector((s) => s.search.filters);
  const filtersEnabled = useSelector((s) => s.search.filtersEnabled);
  const isAuthed = useSelector((s) => Boolean(s.auth?.user));

  const [local, setLocal] = useState(filters);
  const [savedName, setSavedName] = useState('');
  const [savedError, setSavedError] = useState('');
  const [savedBusy, setSavedBusy] = useState(false);

  // Re-sync local edits whenever the panel is opened so the user always
  // starts from the currently-applied filters.
  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  if (!open) return null;

  const close = () => dispatch(filtersPanelToggled(false));

  const change = (patch) => setLocal((prev) => ({ ...prev, ...patch }));

  const apply = () => {
    dispatch(filtersChanged(local));
    if (typeof onApply === 'function') onApply(local);
    close();
  };

  const reset = () => {
    setLocal({
      from: '', to: '', vehicle: '', loadType: '',
      minPrice: '', maxPrice: '', dateFrom: '', dateTo: '', distancePreference: '',
    });
    dispatch(filtersCleared());
  };

  const saveCurrent = async () => {
    setSavedError('');
    if (!savedName.trim()) {
      setSavedError('Give the search a name first');
      return;
    }
    setSavedBusy(true);
    try {
      await dispatch(createSavedSearch({
        name: savedName.trim(),
        filters: local,
      })).unwrap();
      setSavedName('');
    } catch (err) {
      setSavedError(typeof err === 'string' ? err : 'Failed to save search');
    } finally {
      setSavedBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Search filters">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close filters"
        onClick={close}
        className="flex-1 bg-slate-950/60 backdrop-blur-sm"
      />
      {/* Slide-over (desktop) / bottom-sheet (mobile) */}
      <div
        className="
          fixed bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-3xl
          bg-slate-900/95 p-6 text-slate-100 shadow-2xl shadow-slate-950/80
          ring-1 ring-white/10 transition
          sm:left-auto sm:bottom-auto sm:top-0 sm:right-0 sm:h-full sm:max-h-none
          sm:w-[26rem] sm:rounded-none sm:rounded-l-3xl
        "
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filter loads</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close filters"
            className="rounded-full px-2 py-1 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-5 text-sm">
          {filtersEnabled.from && (
            <Field label="From">
              <input
                value={local.from || ''}
                onChange={(e) => change({ from: e.target.value })}
                placeholder="Origin (city or PIN)"
                className={inputCls}
              />
            </Field>
          )}
          {filtersEnabled.to && (
            <Field label="To">
              <input
                value={local.to || ''}
                onChange={(e) => change({ to: e.target.value })}
                placeholder="Destination (city or PIN)"
                className={inputCls}
              />
            </Field>
          )}

          {filtersEnabled.vehicle && (
            <Field label="Vehicle Type">
              <div className="flex flex-wrap gap-2">
                {VEHICLE_PRESETS.map((v) => (
                  <Chip
                    key={v}
                    selected={local.vehicle === v}
                    onClick={() => change({ vehicle: local.vehicle === v ? '' : v })}
                  >
                    {v}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          {filtersEnabled.loadType && (
            <Field label="Load Type">
              <div className="flex gap-2">
                {[
                  { value: '', label: 'Any' },
                  { value: 'full', label: 'Full' },
                  { value: 'part', label: 'Part' },
                ].map((o) => (
                  <Chip
                    key={o.value || 'any'}
                    selected={(local.loadType || '') === o.value}
                    onClick={() => change({ loadType: o.value })}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          {filtersEnabled.price && (
            <Field label="Price range (₹)">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={local.minPrice ?? ''}
                  onChange={(e) => change({ minPrice: e.target.value })}
                  placeholder="Min"
                  className={inputCls}
                />
                <span className="text-slate-500">–</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={local.maxPrice ?? ''}
                  onChange={(e) => change({ maxPrice: e.target.value })}
                  placeholder="Max"
                  className={inputCls}
                />
              </div>
            </Field>
          )}

          {filtersEnabled.date && (
            <Field label="Pickup window">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={local.dateFrom || ''}
                  onChange={(e) => change({ dateFrom: e.target.value })}
                  className={inputCls}
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={local.dateTo || ''}
                  onChange={(e) => change({ dateTo: e.target.value })}
                  className={inputCls}
                />
              </div>
            </Field>
          )}

          {filtersEnabled.distancePreference && (
            <Field label="Route preference">
              <div className="flex flex-wrap gap-2">
                {DISTANCE_PRESETS.map((o) => (
                  <Chip
                    key={o.value || 'any'}
                    selected={(local.distancePreference || '') === o.value}
                    onClick={() => change({ distancePreference: o.value })}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={apply}
            className="flex-1 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Reset
          </button>
        </div>

        {isAuthed && (
          <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-wide text-slate-400">Save this search</p>
            <div className="mt-2 flex gap-2">
              <input
                value={savedName}
                onChange={(e) => setSavedName(e.target.value)}
                placeholder="e.g. Mumbai trips"
                maxLength={80}
                className={inputCls}
              />
              <button
                type="button"
                onClick={saveCurrent}
                disabled={savedBusy}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {savedBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
            {savedError && <p className="mt-2 text-xs text-rose-300">{savedError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        selected
          ? 'bg-cyan-500 text-slate-950'
          : 'bg-white/5 text-slate-200 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export default SearchFiltersPanel;
