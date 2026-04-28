import crypto from 'crypto';

/**
 * Normalise a stack trace to a stable fingerprint so the same logic error
 * raised from different builds (different bundle hashes, different absolute
 * paths) produces the same fingerprint.  Without normalisation every release
 * would create a new ErrorEvent document.
 */
export function normaliseStack(stack = '') {
  return String(stack || '')
    // strip query/hash from URLs
    .replace(/\?[^\s)]+/g, '')
    .replace(/#[^\s)]+/g, '')
    // strip the file scheme + host so "https://app.example.com/assets/foo-abc.js" becomes "/assets/foo.js"
    .replace(/https?:\/\/[^/\s)]+/g, '')
    // strip cache-busting hashes from filenames (foo-abcdef12.js → foo.js)
    .replace(/-[a-f0-9]{8,}\./gi, '.')
    // strip line/column numbers
    .replace(/:\d+:\d+/g, '')
    .replace(/:\d+\)/g, ')')
    .trim();
}

export function fingerprintError({ message = '', stack = '' } = {}) {
  const normalised = `${String(message).slice(0, 500)}\n${normaliseStack(stack)}`;
  return crypto.createHash('sha256').update(normalised).digest('hex').slice(0, 32);
}
