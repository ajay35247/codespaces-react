const STORAGE_KEY = 'speedy-trucks-cookie-consent';

function hasAnalyticsConsent() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function trackPageView(path) {
  if (typeof window !== 'undefined' && hasAnalyticsConsent()) {
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'page_view', page_path: path });
    }
  }
}

export function trackEvent(name, properties = {}) {
  if (typeof window !== 'undefined' && hasAnalyticsConsent()) {
    if (window.dataLayer) {
      window.dataLayer.push({ event: name, ...properties });
    }
  }
}
