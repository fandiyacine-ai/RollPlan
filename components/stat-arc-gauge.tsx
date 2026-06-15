export function StatArcGauge({
  pct,
  label,
  color = '#3b82f6',
  size = 72,
}: {
  pct: number | null
  label: string
  color?: string
  size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 6
  const C = 2 * Math.PI * R
  const value = pct ?? 0
  const fill = (C * value / 100).toFixed(2)
  const gap = (C * (1 - value / 100)).toFixed(2)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth={5} className="text-muted/30" />
        {pct !== null && (
          <circle
            cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${fill} ${gap}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        <text
          x={cx} y={cy + size * 0.07} textAnchor="middle" fontSize={size * 0.22} fontWeight={800}
          fill={pct !== null ? color : 'currentColor'} opacity={pct !== null ? 1 : 0.3}
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {pct !== null ? `${pct}%` : '—'}
        </text>
      </svg>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  )
}
