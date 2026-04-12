export function trackPageView(path) {
  if (typeof window !== 'undefined') {
    console.log(`[Analytics] Page view: ${path}`);
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'page_view', page_path: path });
    }
  }
}

export function trackEvent(name, properties = {}) {
  if (typeof window !== 'undefined') {
    console.log(`[Analytics] Event: ${name}`, properties);
    if (window.dataLayer) {
      window.dataLayer.push({ event: name, ...properties });
    }
  }
}
