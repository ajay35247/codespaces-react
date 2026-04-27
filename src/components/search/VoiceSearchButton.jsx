import { useEffect, useRef, useState } from 'react';

/**
 * Detect the browser-native Speech Recognition API.  Two flavours exist:
 *   - `SpeechRecognition`        — standardised name (Edge, recent Chromium)
 *   - `webkitSpeechRecognition`  — Chrome/Safari prefix (still the default
 *                                  on most installs at time of writing).
 *
 * Returns the constructor or null when neither is available.  We feature-
 * detect at call time (not module load) so SSR / non-browser environments
 * don't blow up on import.
 */
function getRecognition() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return typeof Ctor === 'function' ? Ctor : null;
}

/**
 * VoiceSearchButton — small mic toggle that streams the spoken phrase into
 * `onResult(text)`.  Uses the browser-native Web Speech API only — no
 * server-side STT, no third-party dependency.  Hidden entirely when the
 * browser does not support recognition.
 */
export function VoiceSearchButton({ onResult, lang, className = '' }) {
  const Ctor = getRecognition();
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  // Prefer the explicit prop; otherwise derive from the user agent so we
  // don't ship an "en-IN-only" mic for users in other regions.
  const effectiveLang =
    lang
    || (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage))
    || 'en-IN';

  // Stop any active session when the component unmounts so the mic LED
  // doesn't stay green after navigating away.
  useEffect(() => () => {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
  }, []);

  if (!Ctor) return null;

  const start = () => {
    if (listening) {
      try { recRef.current?.stop?.(); } catch { /* noop */ }
      return;
    }
    let rec;
    try {
      rec = new Ctor();
    } catch {
      return;
    }
    rec.lang = effectiveLang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((r) => r?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript && typeof onResult === 'function') {
        onResult(transcript);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={start}
      title={listening ? 'Listening — tap to stop' : 'Voice search'}
      aria-pressed={listening}
      aria-label={listening ? 'Stop voice search' : 'Start voice search'}
      className={`rounded-full px-2 text-base transition ${
        listening
          ? 'animate-pulse text-rose-400 hover:text-rose-300'
          : 'text-slate-400 hover:text-slate-200'
      } ${className}`}
    >
      🎤
    </button>
  );
}

export default VoiceSearchButton;
