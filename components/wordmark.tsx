import { LogoMark } from '@/components/logo-mark'

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LogoMark className="w-8 h-8 text-foreground" />
      <span className="font-display text-[23px] uppercase leading-none select-none tracking-[0.03em] whitespace-nowrap">
        Roll<span className="text-[#1D4FA8]">Plan</span>
      </span>
    </span>
  )
}
