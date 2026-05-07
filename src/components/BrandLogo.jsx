/**
 * BrandLogo — Speedy Trucks brand identity component.
 *
 * Variants:
 *  - "mark"        : icon-only Velocity Trine (square, default)
 *  - "horizontal"  : mark + wordmark lockup (for headers/navs)
 *  - "mono"        : single-color variant (use `tone` to pick color)
 *
 * Renders SVG inline so the mark scales perfectly, supports CSS color
 * inheritance, and adds zero network requests beyond the bundle.
 *
 * Source SVGs in /public/brand/ are the canonical art files used for
 * exports (favicons, OG images, PDF letterheads, app store packaging).
 * This component mirrors them so React consumers don't need a fetch.
 */
export function BrandLogo({
  variant = 'mark',
  size = 48,
  tone = '#0B3D91',
  className = '',
  title = 'Speedy Trucks',
}) {
  const ariaLabel = title;

  if (variant === 'mono') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width={size}
        height={size}
        role="img"
        aria-label={ariaLabel}
        className={className}
        style={{ color: tone }}
      >
        <title>{title}</title>
        <rect x="0" y="0" width="512" height="512" rx="112" ry="112" fill="currentColor" />
        <g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="44">
          <path d="M130 196 L190 256 L130 316" strokeOpacity="0.4" />
          <path d="M230 196 L290 256 L230 316" strokeOpacity="0.7" />
          <path d="M330 196 L390 256 L330 316" />
        </g>
      </svg>
    );
  }

  if (variant === 'horizontal') {
    const height = size;
    const width = (size * 720) / 200;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 720 200"
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className={className}
      >
        <title>{title}</title>
        <defs>
          <linearGradient id="bl-cobalt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0B3D91" />
            <stop offset="55%" stopColor="#0A2F73" />
            <stop offset="100%" stopColor="#062463" />
          </linearGradient>
          <linearGradient id="bl-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bl-amber" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <g transform="translate(20 20) scale(0.3125)">
          <rect x="0" y="0" width="512" height="512" rx="112" ry="112" fill="url(#bl-cobalt)" />
          <rect x="0" y="0" width="512" height="512" rx="112" ry="112" fill="url(#bl-glass)" />
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="44">
            <path d="M130 196 L190 256 L130 316" stroke="#FFFFFF" strokeOpacity="0.32" />
            <path d="M230 196 L290 256 L230 316" stroke="#FFFFFF" strokeOpacity="0.72" />
            <path d="M330 196 L390 256 L330 316" stroke="url(#bl-amber)" />
          </g>
          <rect x="130" y="376" width="260" height="6" rx="3" fill="#FFFFFF" fillOpacity="0.12" />
        </g>
        <g
          fontFamily="'Inter','Geist','SF Pro Display',system-ui,-apple-system,'Segoe UI',sans-serif"
          textRendering="geometricPrecision"
        >
          <text x="208" y="106" fontSize="64" fontWeight="800" letterSpacing="-1.6" fill="#0B3D91">
            SPEEDY
          </text>
          <text x="208" y="160" fontSize="36" fontWeight="700" letterSpacing="14" fill="#F59E0B">
            TRUCKS
          </text>
        </g>
      </svg>
    );
  }

  // Default: full-color mark
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="bm-cobalt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0B3D91" />
          <stop offset="55%" stopColor="#0A2F73" />
          <stop offset="100%" stopColor="#062463" />
        </linearGradient>
        <linearGradient id="bm-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bm-amber" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx="112" ry="112" fill="url(#bm-cobalt)" />
      <rect x="0" y="0" width="512" height="512" rx="112" ry="112" fill="url(#bm-glass)" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="44">
        <path d="M130 196 L190 256 L130 316" stroke="#FFFFFF" strokeOpacity="0.32" />
        <path d="M230 196 L290 256 L230 316" stroke="#FFFFFF" strokeOpacity="0.72" />
        <path d="M330 196 L390 256 L330 316" stroke="url(#bm-amber)" />
      </g>
      <rect x="130" y="376" width="260" height="6" rx="3" fill="#FFFFFF" fillOpacity="0.12" />
    </svg>
  );
}

export default BrandLogo;
