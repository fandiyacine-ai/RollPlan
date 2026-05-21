'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  completeOnboarding,
  onboardingCreateTournament,
  onboardingAddOpponent,
  onboardingSubmitFootage,
} from './actions'

type Path = 'tournament' | 'matches' | null
type Step =
  | { id: 'welcome' }
  | { id: 't-tournament' }
  | { id: 't-opponent'; tournamentId: string }
  | { id: 't-footage'; tournamentId: string; opponentId: string }
  | { id: 't-done'; tournamentId: string }
  | { id: 'm-footage' }
  | { id: 'm-done' }

function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i === current ? 'bg-foreground' : 'bg-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      onClick={onSkip}
      className="mt-5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
    >
      Skip setup for now
    </button>
  )
}

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ id: 'welcome' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [tName, setTName] = useState('')
  const [tDate, setTDate] = useState('')
  const [tRuleset, setTRuleset] = useState('ibjjf')
  const [opponentName, setOpponentName] = useState('')
  const [footageUrl, setFootageUrl] = useState('')
  const [format, setFormat] = useState<'gi' | 'no_gi'>('gi')

  async function skip() {
    await completeOnboarding()
    router.refresh()
  }

  // ── Path selection ──────────────────────────────────────────────────────────

  if (step.id === 'welcome') {
    return (
      <Overlay>
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-tight">Welcome to FrameMatters</h1>
          <p className="text-sm text-muted-foreground mt-1">What brings you here today?</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Tournament prep card */}
          <button
            onClick={() => setStep({ id: 't-tournament' })}
            className="text-left rounded-xl border border-border/60 bg-card hover:border-primary/60 hover:bg-muted/30 p-4 space-y-3 transition-colors"
          >
            <p className="text-2xl">🏆</p>
            <p className="font-semibold text-sm leading-snug">I have a tournament coming up</p>
            <ol className="space-y-2">
              {[
                { n: '①', text: 'Scout your opponents by uploading or linking their match footage — YouTube, Smoothcomp, any video source' },
                { n: '②', text: 'We generate a personalised gameplan — attack sequences, danger zones & mat-side cues built for that opponent' },
                { n: '③', text: 'Train with purpose — drill the exact scenarios built for this opponent until it\'s muscle memory' },
              ].map(s => (
                <li key={s.n} className="flex gap-2 items-start">
                  <span className="text-xs text-primary font-bold shrink-0 mt-0.5">{s.n}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{s.text}</span>
                </li>
              ))}
            </ol>
            <div className="pt-1">
              <span className="text-xs font-semibold text-primary">Start my prep →</span>
            </div>
          </button>

          {/* Match review card */}
          <button
            onClick={() => setStep({ id: 'm-footage' })}
            className="text-left rounded-xl border border-border/60 bg-card hover:border-primary/60 hover:bg-muted/30 p-4 space-y-3 transition-colors"
          >
            <p className="text-2xl">🎥</p>
            <p className="font-semibold text-sm leading-snug">I want to understand my game</p>
            <ol className="space-y-2">
              {[
                { n: '①', text: 'Upload your match footage — YouTube link or video file' },
                { n: '②', text: 'AI reads your patterns — position control, submission attempts, where you get caught' },
                { n: '③', text: 'Know exactly what to drill — actionable gaps, not just numbers' },
              ].map(s => (
                <li key={s.n} className="flex gap-2 items-start">
                  <span className="text-xs text-primary font-bold shrink-0 mt-0.5">{s.n}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{s.text}</span>
                </li>
              ))}
            </ol>
            <div className="pt-1">
              <span className="text-xs font-semibold text-primary">Analyse my first match →</span>
            </div>
          </button>
        </div>

        <div className="flex justify-center">
          <SkipLink onSkip={skip} />
        </div>
      </Overlay>
    )
  }

  // ── Path A: Tournament ──────────────────────────────────────────────────────

  if (step.id === 't-tournament') {
    return (
      <Overlay>
        <Dots total={3} current={0} />
        <h2 className="text-lg font-bold mb-1">Name your tournament</h2>
        <p className="text-sm text-muted-foreground mb-5">Which event are you preparing for?</p>

        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. ADCC Finnish Open 2026"
            value={tName}
            onChange={e => setTName(e.target.value)}
            autoFocus
          />
          <input
            type="date"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
            value={tDate}
            onChange={e => setTDate(e.target.value)}
          />
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
            value={tRuleset}
            onChange={e => setTRuleset(e.target.value)}
          >
            <option value="ibjjf">IBJJF</option>
            <option value="ajp">AJP</option>
            <option value="adcc">ADCC</option>
            <option value="ebi">EBI</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <button
          disabled={!tName.trim() || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            const fd = new FormData()
            fd.append('name', tName.trim())
            if (tDate) fd.append('eventDate', tDate)
            fd.append('ruleset', tRuleset)
            const result = await onboardingCreateTournament(fd)
            if (result.error) { setError(result.error); return }
            setStep({ id: 't-opponent', tournamentId: result.tournamentId! })
          })}
          className="mt-5 w-full rounded-lg bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {isPending ? 'Creating…' : 'Next →'}
        </button>

        <div className="flex justify-center">
          <SkipLink onSkip={skip} />
        </div>
      </Overlay>
    )
  }

  if (step.id === 't-opponent') {
    return (
      <Overlay>
        <Dots total={3} current={1} />
        <h2 className="text-lg font-bold mb-1">Add your first opponent</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Who are you likely to face? You can add more later.
        </p>

        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Opponent's full name"
          value={opponentName}
          onChange={e => setOpponentName(e.target.value)}
          autoFocus
        />

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <button
          disabled={!opponentName.trim() || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            const opponentId = await onboardingAddOpponent(step.tournamentId, opponentName.trim())
            if (!opponentId) { setError('Could not create opponent, please try again.'); return }
            setStep({ id: 't-footage', tournamentId: step.tournamentId, opponentId })
          })}
          className="mt-5 w-full rounded-lg bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {isPending ? 'Adding…' : 'Next →'}
        </button>

        <div className="flex justify-center">
          <SkipLink onSkip={async () => {
            await completeOnboarding()
            router.push(`/tournaments/${step.tournamentId}/opponents`)
          }} />
        </div>
      </Overlay>
    )
  }

  if (step.id === 't-footage') {
    return (
      <Overlay>
        <Dots total={3} current={2} />
        <h2 className="text-lg font-bold mb-1">Link their footage</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Paste a YouTube URL of {opponentName} competing. Smoothcomp streams work too.
        </p>
        <p className="text-xs text-muted-foreground/60 mb-5">
          Analysis takes 2–5 minutes once submitted.
        </p>

        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="https://youtube.com/watch?v=..."
            value={footageUrl}
            onChange={e => setFootageUrl(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="fmt" value="gi" checked={format === 'gi'} onChange={() => setFormat('gi')} />
              Gi
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="fmt" value="no_gi" checked={format === 'no_gi'} onChange={() => setFormat('no_gi')} />
              No-Gi
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <button
          disabled={!footageUrl.trim() || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            try {
              await onboardingSubmitFootage(step.tournamentId, step.opponentId, footageUrl.trim(), format)
              await completeOnboarding()
              setStep({ id: 't-done', tournamentId: step.tournamentId })
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to submit footage')
            }
          })}
          className="mt-5 w-full rounded-lg bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {isPending ? 'Submitting…' : 'Start analysis →'}
        </button>

        <div className="flex justify-center">
          <button
            onClick={() => startTransition(async () => {
              await completeOnboarding()
              setStep({ id: 't-done', tournamentId: step.tournamentId })
            })}
            className="mt-3 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            I&apos;ll add footage later
          </button>
        </div>
      </Overlay>
    )
  }

  if (step.id === 't-done') {
    return (
      <Overlay>
        <div className="text-center space-y-4">
          <p className="text-4xl">🥋</p>
          <div>
            <h2 className="text-lg font-bold">You&apos;re set up</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              {footageUrl
                ? 'Footage is being analysed — usually takes 2–5 minutes. Once done, generate your gameplan.'
                : 'Add footage for your opponent when you\'re ready, then generate your gameplan.'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto">
            Preparation takes time — the more footage you add, the sharper your gameplan gets.
          </p>
          <button
            onClick={() => {
              router.push(`/tournaments/${step.tournamentId}/opponents`)
              router.refresh()
            }}
            className="w-full rounded-lg bg-foreground text-background py-2.5 text-sm font-semibold"
          >
            Go to my tournament →
          </button>
        </div>
      </Overlay>
    )
  }

  // ── Path B: Match review ────────────────────────────────────────────────────

  if (step.id === 'm-footage') {
    return (
      <Overlay>
        <Dots total={1} current={0} />
        <h2 className="text-lg font-bold mb-1">Link your match footage</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Paste a YouTube URL of one of your matches.
        </p>
        <p className="text-xs text-muted-foreground/60 mb-5">
          Analysis takes 2–5 minutes. You&apos;ll see your patterns, positions, and gaps.
        </p>

        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="https://youtube.com/watch?v=..."
            value={footageUrl}
            onChange={e => setFootageUrl(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="fmt2" value="gi" checked={format === 'gi'} onChange={() => setFormat('gi')} />
              Gi
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="fmt2" value="no_gi" checked={format === 'no_gi'} onChange={() => setFormat('no_gi')} />
              No-Gi
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <button
          disabled={!footageUrl.trim() || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            await completeOnboarding()
            router.push(`/upload?url=${encodeURIComponent(footageUrl.trim())}&format=${format}`)
            router.refresh()
          })}
          className="mt-5 w-full rounded-lg bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {isPending ? 'Going…' : 'Analyse my match →'}
        </button>

        <div className="flex justify-center">
          <SkipLink onSkip={skip} />
        </div>
      </Overlay>
    )
  }

  return null
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border border-border/60 rounded-2xl p-6 shadow-xl flex flex-col">
        {children}
      </div>
    </div>
  )
}
