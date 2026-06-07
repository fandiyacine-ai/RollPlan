// A quiet trust-contract reminder for pages that hold scouting/prep content —
// gameplans, opponent intel, match analysis. These are exactly the surfaces
// where someone might wonder "could my opponent see this?" — so we say no,
// directly, right where the content lives. See ROADMAP "earned connections"
// spec: connections never see gameplans, footage, or AI analysis — only you do.
export function PrivateBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 ${className}`}
      title="This content is never shared — not with opponents, not with connections. Only you can see it."
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Private — only visible to you
    </span>
  )
}
