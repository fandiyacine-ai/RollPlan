// Country flag lookup — ordered most-specific first so substrings don't short-circuit
const LOCATION_FLAGS: [string, string][] = [
  // Multi-word country names / disambiguated before shorter tokens
  ['united arab emirates', '🇦🇪'],
  ['united kingdom', '🇬🇧'],
  ['united states', '🇺🇸'],
  ['south korea', '🇰🇷'],
  ['saudi arabia', '🇸🇦'],
  ['new zealand', '🇳🇿'],
  ['czech republic', '🇨🇿'],
  ['czech', '🇨🇿'],
  ['rio de janeiro', '🇧🇷'],
  ['são paulo', '🇧🇷'], ['sao paulo', '🇧🇷'],
  ['abu dhabi', '🇦🇪'], ['dubai', '🇦🇪'],
  ['las vegas', '🇺🇸'], ['los angeles', '🇺🇸'], ['new york', '🇺🇸'],
  ['chicago', '🇺🇸'], ['atlanta', '🇺🇸'], ['miami', '🇺🇸'],
  ['houston', '🇺🇸'], ['dallas', '🇺🇸'], ['san jose', '🇺🇸'],
  ['boston', '🇺🇸'], ['long beach', '🇺🇸'],
  ['toronto', '🇨🇦'], ['montreal', '🇨🇦'], ['vancouver', '🇨🇦'],
  ['stockholm', '🇸🇪'],
  ['oslo', '🇳🇴'],
  ['tbilisi', '🇬🇪'],
  ['almeria', '🇪🇸'], ['alicante', '🇪🇸'], ['madrid', '🇪🇸'], ['barcelona', '🇪🇸'],
  ['lisbon', '🇵🇹'], ['porto', '🇵🇹'],
  ['amsterdam', '🇳🇱'],
  ['berlin', '🇩🇪'], ['munich', '🇩🇪'],
  ['tokyo', '🇯🇵'], ['osaka', '🇯🇵'],
  ['sydney', '🇦🇺'], ['melbourne', '🇦🇺'],
  ['seoul', '🇰🇷'],
  ['taipei', '🇹🇼'],
  ['singapore', '🇸🇬'],
  ['bangkok', '🇹🇭'],
  ['london', '🇬🇧'], ['manchester', '🇬🇧'], ['birmingham', '🇬🇧'],
  ['paris', '🇫🇷'],
  ['rome', '🇮🇹'], ['milan', '🇮🇹'],
  // Country tokens — after city lookups to avoid e.g. "Georgia, USA" matching Georgia 🇬🇪
  [', uae', '🇦🇪'], [', uk', '🇬🇧'], [', usa', '🇺🇸'], [', us', '🇺🇸'],
  ['uae', '🇦🇪'], ['uk', '🇬🇧'], ['usa', '🇺🇸'],
  ['brazil', '🇧🇷'],
  ['spain', '🇪🇸'],
  ['france', '🇫🇷'],
  ['portugal', '🇵🇹'],
  ['japan', '🇯🇵'],
  ['australia', '🇦🇺'],
  ['germany', '🇩🇪'],
  ['italy', '🇮🇹'],
  ['netherlands', '🇳🇱'], ['holland', '🇳🇱'],
  ['russia', '🇷🇺'],
  ['kazakhstan', '🇰🇿'],
  ['georgia', '🇬🇪'],
  ['sweden', '🇸🇪'],
  ['norway', '🇳🇴'],
  ['canada', '🇨🇦'],
  ['mexico', '🇲🇽'],
  ['colombia', '🇨🇴'],
  ['argentina', '🇦🇷'],
  ['bahrain', '🇧🇭'],
  ['qatar', '🇶🇦'],
  ['taiwan', '🇹🇼'],
  ['korea', '🇰🇷'],
  ['poland', '🇵🇱'],
  ['austria', '🇦🇹'],
  ['hungary', '🇭🇺'],
  ['finland', '🇫🇮'],
  ['denmark', '🇩🇰'],
  ['belgium', '🇧🇪'],
  ['switzerland', '🇨🇭'],
  ['thailand', '🇹🇭'],
  ['ireland', '🇮🇪'],
  ['scotland', '🇬🇧'],
  ['england', '🇬🇧'],
  ['peru', '🇵🇪'],
  ['chile', '🇨🇱'],
  ['egypt', '🇪🇬'],
  ['morocco', '🇲🇦'],
]

export function countryFlag(location: string | null): string | null {
  if (!location) return null
  const lower = location.toLowerCase()
  for (const [token, flag] of LOCATION_FLAGS) {
    if (lower.includes(token)) return flag
  }
  return null
}

// Condenses a pipe-delimited medal string (e.g. "Gold – Worlds 2026|Silver – Pans 2025|...")
// into tier counts for display, e.g. "30 Gold · 15 Silver · 4 Bronze"
const MEDAL_TIER_ORDER = ['Gold', 'Silver', 'Bronze'] as const

export function condenseMedals(result: string | null | undefined): string | null {
  if (!result) return null
  const counts: Record<string, number> = {}
  for (const entry of result.split('|')) {
    const tier = entry.split(' – ')[0]?.trim()
    if (tier) counts[tier] = (counts[tier] ?? 0) + 1
  }
  const parts = MEDAL_TIER_ORDER
    .filter(tier => counts[tier] > 0)
    .map(tier => `${counts[tier]} ${tier}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function giNoGi(ruleset: string, name: string): 'gi' | 'nogi' {
  if (['adcc', 'ebi', 'nogi'].includes(ruleset)) return 'nogi'
  const l = name.toLowerCase()
  if (l.includes('no-gi') || l.includes('nogi') || l.includes('no gi')) return 'nogi'
  return 'gi'
}
