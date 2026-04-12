import { useEffect, useState } from 'react';

const STORAGE_KEY = 'speedy-trucks-cookie-consent';

export function CookieConsentBanner() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setAccepted(stored === 'true');
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-3xl border border-white/10 bg-slate-950/95 px-6 py-4 text-sm text-slate-200 shadow-2xl shadow-slate-900/40 sm:max-w-3xl sm:mx-auto">
      <p>
        This site uses cookies to improve your experience and collect anonymous usage metrics. By continuing to use Speedy Trucks, you agree to our{' '}
        <a href="/privacy" className="font-semibold text-sky-300 underline">Privacy Policy</a>.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          onClick={handleAccept}
          className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
        >
          Accept cookies
        </button>
      </div>
    </div>
  );
}
