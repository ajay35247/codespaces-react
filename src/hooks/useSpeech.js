import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API dictation hook — English only.
 *
 * Honest limits (see docs/MOBILE-BUILD.md and the driver POD UI):
 *   • Only Chromium-based browsers reliably expose `webkitSpeechRecognition`.
 *   • `lang` is hard-coded to `en-IN` / `en-US`; Hindi / regional voice would
 *     need a paid ASR (Google STT hi-IN, Bhashini) and is deliberately out
 *     of scope.
 *   • Continuous mode streams interim results but the final transcript is
 *     only committed when recognition ends or the user hits stop.
 *
 * @param {string} [lang='en-IN']
 */
export function useSpeechDictation(lang = 'en-IN') {
  const recognitionRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return undefined;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) {
        // Known limitation: Web Speech recognisers emit each final chunk
        // without surrounding punctuation, so we join with a single space.
        // This produces acceptable results for short POD fields (names,
        // one-line notes) but may read awkwardly around existing commas
        // or periods — callers can edit the field afterwards.
        setTranscript((t) => (t ? `${t} ${finalText}` : finalText).trim());
      }
      setInterim(interimText);
    };
    rec.onerror = (event) => {
      setError(event.error || 'speech-error');
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognitionRef.current = rec;
    return () => {
      try { rec.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listening) return;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}

/**
 * Browser-native TTS. Returns `{ supported, speak, cancel }`.
 */
export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback((text, { lang = 'en-IN', rate = 1 } = {}) => {
    if (!supported || !text) return;
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
  }, [supported]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, cancel };
}
