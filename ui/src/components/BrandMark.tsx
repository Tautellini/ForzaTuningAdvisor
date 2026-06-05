/** The app mark — same artwork as public/favicon.svg, inlined so it scales
 *  crisply and picks up the theme variables. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--surface-container-highest)" />
      <path d="M36 8 L48 8 L26 56 L14 56 Z" fill="var(--primary)" />
      <path d="M52 8 L58 8 L36 56 L30 56 Z" fill="var(--secondary)" />
    </svg>
  );
}
