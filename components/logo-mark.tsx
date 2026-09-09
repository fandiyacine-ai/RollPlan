export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="72" width="62" height="30" rx="7" fill="currentColor" />
      <rect x="130" y="72" width="62" height="30" rx="7" fill="currentColor" />
      <g transform="translate(78,116) rotate(24)">
        <rect x="-15" y="-10" width="30" height="68" rx="9" fill="currentColor" />
      </g>
      <g transform="translate(122,116) rotate(-24)">
        <rect x="-15" y="-10" width="30" height="68" rx="9" fill="currentColor" />
      </g>
      <g transform="rotate(45 100 87)">
        <rect x="73" y="60" width="54" height="54" rx="10" fill="#1D4FA8" stroke="var(--background)" strokeWidth="8" />
        <rect x="80" y="67" width="40" height="40" rx="5" fill="#F5C518" />
      </g>
    </svg>
  )
}
