// Inline SVG marks inspired by each org's visual identity
const ICONS: Record<string, React.ReactNode> = {
  ibjjf: (
    // Globe — international federation
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.5" />
      <path d="M1.5 8h13" />
    </svg>
  ),
  ajp: (
    // Falcon silhouette — Abu Dhabi Jiu-Jitsu Pro
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2 C7 4 5 5 3 5 L4.5 7 L2 11 L6.5 9 L8 14 L9.5 9 L14 11 L11.5 7 L13 5 C11 5 9 4 8 2Z" />
    </svg>
  ),
  adcc: (
    // Diamond — ADCC prestige mark
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" />
    </svg>
  ),
  ebi: (
    // Lightning bolt — EBI
    <svg width="9" height="11" viewBox="0 0 14 16" fill="currentColor">
      <path d="M9.5 1L4 9h4.5L4.5 15 11 7H6.5z" />
    </svg>
  ),
  nogi: (
    // Flame / no-gi icon
    <svg width="9" height="11" viewBox="0 0 14 16" fill="currentColor">
      <path d="M7 1c0 4-4 5-4 9a4 4 0 008 0C11 6 8 5 7 1zM7 13a2 2 0 01-2-2c0-2 2-3 2-3s2 1 2 3a2 2 0 01-2 2z" />
    </svg>
  ),
}

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ibjjf: { bg: 'bg-blue-600',    text: 'text-white',          label: 'IBJJF' },
  ajp:   { bg: 'bg-amber-500',   text: 'text-black',          label: 'AJP' },
  adcc:  { bg: 'bg-zinc-800',    text: 'text-amber-400',      label: 'ADCC' },
  ebi:   { bg: 'bg-rose-600',    text: 'text-white',          label: 'EBI' },
  nogi:  { bg: 'bg-orange-500',  text: 'text-white',          label: 'No-Gi' },
  other: { bg: 'bg-zinc-500',    text: 'text-white',          label: 'Other' },
}

export function RulesetBadge({ ruleset, className = '' }: { ruleset: string; className?: string }) {
  const s = STYLES[ruleset] ?? STYLES.other
  const icon = ICONS[ruleset]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${s.bg} ${s.text} ${className}`}>
      {icon}
      {s.label}
    </span>
  )
}
