import { BRAND_COLOR } from "@/lib/site";

/**
 * The M42 mark: an "M" drawn as a course profile (two climbs, then the
 * finish dot) on a rounded brand tile. Same geometry as app/icon.svg.
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="15" fill={BRAND_COLOR} />
      <path d="M9 44L19.5 18L31 35L42.5 18L50 37" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="53.5" cy="44.5" r="4.6" fill="#fff" />
    </svg>
  );
}

/** "M42" with the distance in brand orange. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      M<span style={{ color: BRAND_COLOR }}>42</span>
    </span>
  );
}
