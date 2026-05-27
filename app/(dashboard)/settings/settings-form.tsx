'use client'

import { useActionState, useState } from 'react'
import { updateProfile } from './actions'

const ADULT_BELTS = [
  { value: 'white',  label: 'White',  color: '#e5e5e5', text: '#000' },
  { value: 'blue',   label: 'Blue',   color: '#1d4ed8', text: '#fff' },
  { value: 'purple', label: 'Purple', color: '#7c3aed', text: '#fff' },
  { value: 'brown',  label: 'Brown',  color: '#78350f', text: '#fff' },
  { value: 'black',  label: 'Black',  color: '#0a0a0a', text: '#fff' },
]

const KIDS_BELTS = [
  { value: 'grey',   label: 'Grey',   color: '#9ca3af', text: '#000' },
  { value: 'yellow', label: 'Yellow', color: '#eab308', text: '#000' },
  { value: 'orange', label: 'Orange', color: '#f97316', text: '#fff' },
  { value: 'green',  label: 'Green',  color: '#16a34a', text: '#fff' },
]

const KIDS_BELT_VALUES = KIDS_BELTS.map(b => b.value)

const STYLES = [
  { value: 'gi',     label: 'Gi' },
  { value: 'no_gi',  label: 'No-Gi' },
  { value: 'both',   label: 'Both' },
]

const ADULT_WEIGHT_CLASSES = [
  { kg: 57,  label: 'Rooster · 57 kg' },
  { kg: 64,  label: 'Light Feather · 64 kg' },
  { kg: 70,  label: 'Feather · 70 kg' },
  { kg: 76,  label: 'Light · 76 kg' },
  { kg: 82,  label: 'Middle · 82 kg' },
  { kg: 88,  label: 'Medium Heavy · 88 kg' },
  { kg: 94,  label: 'Heavy · 94 kg' },
  { kg: 100, label: 'Super Heavy · 100 kg' },
  { kg: 110, label: 'Ultra Heavy · 110+ kg' },
]

const KIDS_WEIGHT_CLASSES = [
  { kg: 38,  label: 'Under 38 kg' },
  { kg: 42,  label: 'Under 42 kg' },
  { kg: 46,  label: 'Under 46 kg' },
  { kg: 50,  label: 'Under 50 kg' },
  { kg: 55,  label: 'Under 55 kg' },
  { kg: 60,  label: 'Under 60 kg' },
  { kg: 65,  label: 'Under 65 kg' },
  { kg: 70,  label: 'Under 70 kg' },
]

type Props = {
  defaultBelt?: string | null
  defaultStyle?: string | null
  defaultWeightClassKg?: number | null
  defaultGym?: string | null
  defaultGoals?: string | null
  defaultSmootcompProfileUrl?: string | null
}

export function SettingsForm({ defaultBelt, defaultStyle, defaultWeightClassKg, defaultGym, defaultGoals, defaultSmootcompProfileUrl }: Props) {
  const [state, action, pending] = useActionState(updateProfile, {})
  const [category, setCategory] = useState<'adult' | 'kids'>(
    defaultBelt && KIDS_BELT_VALUES.includes(defaultBelt) ? 'kids' : 'adult'
  )

  const belts = category === 'kids' ? KIDS_BELTS : ADULT_BELTS
  const weights = category === 'kids' ? KIDS_WEIGHT_CLASSES : ADULT_WEIGHT_CLASSES

  // If switching category, reset belt selection to avoid mismatch
  function handleCategorySwitch(next: 'adult' | 'kids') {
    setCategory(next)
  }

  return (
    <form action={action} className="space-y-10">

      {/* Competitor Category */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Competitor Category</h2>
        <div className="flex gap-2 rounded-lg bg-muted p-1 w-fit">
          {([
            { value: 'adult', label: 'Adult / Teen' },
            { value: 'kids',  label: 'Kids (< 16)' },
          ] as const).map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => handleCategorySwitch(cat.value)}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                category === cat.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Belt */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Belt</h2>
        <div className="flex flex-wrap gap-3">
          {belts.map((b) => (
            <label key={b.value} className="cursor-pointer">
              <input
                type="radio"
                name="belt"
                value={b.value}
                defaultChecked={defaultBelt === b.value}
                className="sr-only peer"
              />
              <span
                className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-offset-background peer-checked:ring-current transition-all select-none"
                style={{ backgroundColor: b.color, color: b.text }}
              >
                {b.label}
              </span>
            </label>
          ))}
        </div>
        {category === 'kids' && (
          <p className="text-xs text-muted-foreground mt-2">IBJJF youth belt colours (grey, yellow, orange, green)</p>
        )}
      </section>

      {/* Style */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Primary Style</h2>
        <div className="flex gap-2 rounded-lg bg-muted p-1 w-fit">
          {STYLES.map((s) => (
            <label key={s.value} className="cursor-pointer">
              <input
                type="radio"
                name="primaryStyle"
                value={s.value}
                defaultChecked={defaultStyle === s.value}
                className="sr-only peer"
              />
              <span className="inline-flex px-5 py-1.5 rounded-md text-sm font-medium text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm transition-all select-none">
                {s.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Weight class */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Weight Class</h2>
        <input type="hidden" name="weightClassKg" id="weightClassKgInput" defaultValue={defaultWeightClassKg ?? ''} />
        <div className="flex flex-wrap gap-2" id="weightPills">
          {weights.map((w) => (
            <WeightPill
              key={w.kg}
              kg={w.kg}
              label={w.label}
              defaultSelected={defaultWeightClassKg === w.kg}
            />
          ))}
        </div>
      </section>

      {/* Gym */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Gym / Academy</h2>
        <input
          name="gym"
          type="text"
          defaultValue={defaultGym ?? ''}
          placeholder="e.g. Atos HQ, New Wave Jiu-Jitsu…"
          className="w-full max-w-md rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </section>

      {/* Goals */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Training Goals</h2>
        <textarea
          name="goals"
          defaultValue={defaultGoals ?? ''}
          rows={4}
          placeholder="What are you working towards? The AI uses this when generating gameplans and coaching notes."
          className="w-full max-w-lg rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </section>

      {/* Smoothcomp profile */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Smoothcomp Profile</h2>
        <p className="text-xs text-muted-foreground mb-4">Used to automatically exclude you from bracket imports and identify your matches.</p>
        <input
          name="smoothcompProfileUrl"
          type="url"
          defaultValue={defaultSmootcompProfileUrl ?? ''}
          placeholder="https://smoothcomp.com/en/athlete/12345"
          className="w-full max-w-md rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1.5">Go to your Smoothcomp profile page and paste the URL here.</p>
      </section>

      {/* Submit */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
        {state.success && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}

function WeightPill({ kg, label, defaultSelected }: { kg: number; label: string; defaultSelected: boolean }) {
  return (
    <button
      type="button"
      data-kg={kg}
      onClick={(e) => {
        const btn = e.currentTarget
        const pills = btn.parentElement!.querySelectorAll('[data-kg]')
        const input = document.getElementById('weightClassKgInput') as HTMLInputElement
        const wasActive = btn.dataset.active === 'true'
        pills.forEach((p) => {
          (p as HTMLElement).dataset.active = 'false'
          p.className = p.className.replace('bg-foreground text-background', 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80')
        })
        if (!wasActive) {
          btn.dataset.active = 'true'
          btn.className = btn.className.replace('bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80', 'bg-foreground text-background')
          input.value = String(kg)
        } else {
          input.value = ''
        }
      }}
      data-active={defaultSelected ? 'true' : 'false'}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        defaultSelected
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
      }`}
    >
      {label}
    </button>
  )
}
