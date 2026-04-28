import { useEffect, useRef, useState, useCallback } from 'react';
import { readDraft, writeDraft, scheduleWrite, clearDraft } from '../services/stateGuardian';

/**
 * useDraft — keeps a piece of state mirrored in localStorage so the user
 * doesn't lose work across crashes, accidental reloads, or self-healing
 * route reloads.
 *
 * @param {string} key       Stable key (e.g. `load-form:${loadId}`).
 * @param {*}      initial   Initial value when no draft is stored.
 * @returns [value, setValue, clear]
 *
 * Saves are debounced (400ms) to avoid thrashing localStorage on every
 * keystroke, and a `beforeunload` handler flushes the latest value
 * synchronously so a tab close in the middle of typing isn't lost.
 */
export function useDraft(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = readDraft(key, undefined);
    return stored === undefined ? initial : stored;
  });
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    scheduleWrite(key, value);
  }, [key, value]);

  useEffect(() => {
    const onBeforeUnload = () => {
      // Synchronous flush — debounced writes may not have fired yet.
      writeDraft(key, valueRef.current);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onBeforeUnload);
    };
  }, [key]);

  const clear = useCallback(() => {
    clearDraft(key);
    setValue(initial);
  }, [key, initial]);

  return [value, setValue, clear];
}
