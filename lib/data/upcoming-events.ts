export type CatalogEvent = {
  name: string
  date: string        // ISO YYYY-MM-DD
  ruleset: 'ibjjf' | 'ajp' | 'adcc' | 'ebi' | 'other'
  location: string
  smoothcompUrl?: string
}

// Major BJJ events 2025–2026. Dates are approximate where not yet announced.
export const UPCOMING_EVENTS: CatalogEvent[] = [
  // ── IBJJF ──────────────────────────────────────────────────────────────────
  { name: 'IBJJF European Open 2026', date: '2026-01-19', ruleset: 'ibjjf', location: 'Lisbon, Portugal' },
  { name: 'IBJJF Miami Open 2026', date: '2026-02-07', ruleset: 'ibjjf', location: 'Miami, FL, USA' },
  { name: 'IBJJF Pan Championship 2026', date: '2026-03-18', ruleset: 'ibjjf', location: 'Kissimmee, FL, USA' },
  { name: 'IBJJF Brazilian Nationals 2026', date: '2026-04-22', ruleset: 'ibjjf', location: 'São Paulo, Brazil' },
  { name: 'IBJJF World Championship 2026', date: '2026-06-03', ruleset: 'ibjjf', location: 'Long Beach, CA, USA' },
  { name: 'IBJJF Rome Open 2026', date: '2026-06-27', ruleset: 'ibjjf', location: 'Rome, Italy' },
  { name: 'IBJJF London Open 2026', date: '2026-07-11', ruleset: 'ibjjf', location: 'London, UK' },
  { name: 'IBJJF Chicago Open 2026', date: '2026-08-22', ruleset: 'ibjjf', location: 'Chicago, IL, USA' },
  { name: 'IBJJF Las Vegas Open 2026', date: '2026-09-05', ruleset: 'ibjjf', location: 'Las Vegas, NV, USA' },
  { name: 'IBJJF Worlds No-Gi 2026', date: '2026-10-17', ruleset: 'ibjjf', location: 'Los Angeles, CA, USA' },
  { name: 'IBJJF European No-Gi Open 2026', date: '2026-11-07', ruleset: 'ibjjf', location: 'London, UK' },
  { name: 'IBJJF Pan No-Gi 2026', date: '2026-12-05', ruleset: 'ibjjf', location: 'Las Vegas, NV, USA' },

  // ── AJP ────────────────────────────────────────────────────────────────────
  { name: 'AJP Grand Slam Abu Dhabi 2026', date: '2026-04-10', ruleset: 'ajp', location: 'Abu Dhabi, UAE' },
  { name: 'AJP Grand Slam London 2026', date: '2026-05-08', ruleset: 'ajp', location: 'London, UK' },
  { name: 'AJP Grand Slam Tokyo 2026', date: '2026-07-17', ruleset: 'ajp', location: 'Tokyo, Japan' },
  { name: 'AJP Grand Slam Paris 2026', date: '2026-09-25', ruleset: 'ajp', location: 'Paris, France' },
  { name: 'AJP World Pro 2026', date: '2026-04-25', ruleset: 'ajp', location: 'Abu Dhabi, UAE' },

  // ── ADCC ───────────────────────────────────────────────────────────────────
  { name: 'ADCC European Trials 2026', date: '2026-02-21', ruleset: 'adcc', location: 'Europe (TBC)' },
  { name: 'ADCC North American Trials 2026', date: '2026-03-07', ruleset: 'adcc', location: 'USA (TBC)' },
  { name: 'ADCC South American Trials 2026', date: '2026-04-04', ruleset: 'adcc', location: 'Brazil (TBC)' },
  { name: 'ADCC World Championships 2026', date: '2026-09-19', ruleset: 'adcc', location: 'TBC' },

  // ── Polaris ────────────────────────────────────────────────────────────────
  { name: 'Polaris 24', date: '2026-02-28', ruleset: 'other', location: 'Cardiff, Wales' },
  { name: 'Polaris 25', date: '2026-08-01', ruleset: 'other', location: 'Cardiff, Wales' },

  // ── EBI ────────────────────────────────────────────────────────────────────
  { name: 'EBI Combat Jiu-Jitsu Worlds 2026', date: '2026-06-20', ruleset: 'ebi', location: 'Los Angeles, CA, USA' },
]

export function searchEvents(query: string): CatalogEvent[] {
  if (!query.trim()) return UPCOMING_EVENTS
  const q = query.toLowerCase()
  return UPCOMING_EVENTS.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.location.toLowerCase().includes(q) ||
    e.ruleset.toLowerCase().includes(q)
  )
}
