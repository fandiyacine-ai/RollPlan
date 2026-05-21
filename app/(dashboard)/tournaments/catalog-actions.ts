'use server'

import { db } from '@/lib/db'
import { canonicalTournaments, tournaments } from '@/lib/db/schema'
import { and, asc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm'

export type CatalogEntry = {
  id: string
  name: string
  eventDate: string | null
  location: string | null
  ruleset: string
  source: string
  smoothcompUrl: string | null
  userCount: number
}

// Country code (ISO 3166-1 alpha-2) → continent
const CONTINENT: Record<string, string> = {
  // Europe
  FI:'EU',SE:'EU',NO:'EU',DK:'EU',GB:'EU',IE:'EU',FR:'EU',DE:'EU',AT:'EU',CH:'EU',
  NL:'EU',BE:'EU',LU:'EU',ES:'EU',PT:'EU',IT:'EU',GR:'EU',PL:'EU',CZ:'EU',SK:'EU',
  HU:'EU',RO:'EU',BG:'EU',HR:'EU',SI:'EU',RS:'EU',EE:'EU',LV:'EU',LT:'EU',
  // Americas
  US:'AM',CA:'AM',MX:'AM',BR:'AM',AR:'AM',CO:'AM',CL:'AM',PE:'AM',VE:'AM',
  // Asia / Middle East
  JP:'AS',KR:'AS',CN:'AS',AE:'AS',SA:'AS',IL:'AS',SG:'AS',TH:'AS',IN:'AS',
  // Oceania
  AU:'OC',NZ:'OC',
  // Africa
  ZA:'AF',EG:'AF',MA:'AF',
}

// Region groupings within a continent for finer sorting
const REGION: Record<string, string> = {
  FI:'NORDIC',SE:'NORDIC',NO:'NORDIC',DK:'NORDIC',
  GB:'UK_IE',IE:'UK_IE',
  FR:'W_EUR',DE:'W_EUR',AT:'W_EUR',CH:'W_EUR',NL:'W_EUR',BE:'W_EUR',LU:'W_EUR',
  ES:'S_EUR',PT:'S_EUR',IT:'S_EUR',GR:'S_EUR',
  PL:'E_EUR',CZ:'E_EUR',SK:'E_EUR',HU:'E_EUR',RO:'E_EUR',BG:'E_EUR',HR:'E_EUR',SI:'E_EUR',RS:'E_EUR',
  EE:'BALT',LV:'BALT',LT:'BALT',
  US:'N_AM',CA:'N_AM',MX:'N_AM',
  BR:'S_AM',AR:'S_AM',CO:'S_AM',CL:'S_AM',PE:'S_AM',
  JP:'E_ASIA',KR:'E_ASIA',CN:'E_ASIA',
  AE:'ME',SA:'ME',IL:'ME',
  AU:'ANZ',NZ:'ANZ',
}

// Common country name → ISO 3166-1 alpha-2 (for matching location strings)
const NAME_TO_CODE: Record<string, string> = {
  'finland':'FI','sweden':'SE','norway':'NO','denmark':'DK',
  'united kingdom':'GB','uk':'GB','england':'GB','scotland':'GB','wales':'GB',
  'ireland':'IE','france':'FR','germany':'DE','austria':'AT','switzerland':'CH',
  'netherlands':'NL','belgium':'BE','spain':'ES','portugal':'PT','italy':'IT','greece':'GR',
  'poland':'PL','czech republic':'CZ','czechia':'CZ','slovakia':'SK','hungary':'HU',
  'romania':'RO','bulgaria':'BG','croatia':'HR','slovenia':'SI','serbia':'RS',
  'estonia':'EE','latvia':'LV','lithuania':'LT',
  'usa':'US','united states':'US','u.s.a.':'US',
  'canada':'CA','mexico':'MX','brazil':'BR','argentina':'AR','colombia':'CO',
  'chile':'CL','peru':'PE','venezuela':'VE',
  'japan':'JP','south korea':'KR','korea':'KR','china':'CN',
  'uae':'AE','united arab emirates':'AE','saudi arabia':'SA','israel':'IL',
  'singapore':'SG','thailand':'TH','india':'IN',
  'australia':'AU','new zealand':'NZ',
  'south africa':'ZA','egypt':'EG','morocco':'MA',
}

function countryFromLocation(location: string | null): string | null {
  if (!location) return null
  const lower = location.toLowerCase()
  // Try longest match first (e.g. "united states" before "states")
  const sorted = Object.keys(NAME_TO_CODE).sort((a, b) => b.length - a.length)
  for (const name of sorted) {
    if (lower.includes(name)) return NAME_TO_CODE[name]
  }
  return null
}

// Locale string like "fi-FI", "en-GB", "fr-FR" → ISO country code
function localeToCountry(locale: string): string | null {
  const parts = locale.split(/[-_]/)
  const code = parts[parts.length - 1]?.toUpperCase()
  return code && code.length === 2 ? code : null
}

// Score 0 = best match, higher = worse
function proximityScore(eventCountry: string | null, userCountry: string | null): number {
  if (!userCountry || !eventCountry) return 3
  if (eventCountry === userCountry) return 0
  if (REGION[eventCountry] && REGION[eventCountry] === REGION[userCountry]) return 1
  if (CONTINENT[eventCountry] && CONTINENT[eventCountry] === CONTINENT[userCountry]) return 2
  return 3
}

export async function searchCatalogAction(query: string, userLocale?: string): Promise<CatalogEntry[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const tokens = query.trim().split(/\s+/).filter(t => t.length >= 2)

    const tokenFilters = tokens.map(t =>
      or(
        ilike(canonicalTournaments.name, `%${t}%`),
        ilike(canonicalTournaments.location, `%${t}%`),
      )
    )

    const rows = await db
      .select({
        id: canonicalTournaments.id,
        name: canonicalTournaments.name,
        eventDate: canonicalTournaments.eventDate,
        location: canonicalTournaments.location,
        ruleset: canonicalTournaments.ruleset,
        source: canonicalTournaments.source,
        smoothcompUrl: canonicalTournaments.smoothcompUrl,
        userCount: sql<number>`count(distinct ${tournaments.id})::int`,
      })
      .from(canonicalTournaments)
      .leftJoin(tournaments, eq(tournaments.canonicalTournamentId, canonicalTournaments.id))
      .where(
        and(
          or(isNull(canonicalTournaments.eventDate), gte(canonicalTournaments.eventDate, today)),
          tokenFilters.length > 0 ? and(...tokenFilters) : undefined,
        ),
      )
      .groupBy(canonicalTournaments.id)
      .orderBy(asc(canonicalTournaments.eventDate))
      .limit(100)

    const userCountry = userLocale ? localeToCountry(userLocale) : null

    // When searching (has query tokens), keep date order — the user knows what they want.
    // When browsing (no query), sort by proximity then date.
    if (!userCountry || tokens.length > 0) {
      return (rows as CatalogEntry[]).slice(0, 20)
    }

    const scored = (rows as CatalogEntry[]).map(row => ({
      row,
      score: proximityScore(countryFromLocation(row.location), userCountry),
      date: row.eventDate ?? '9999-99-99',
    }))

    scored.sort((a, b) => a.score - b.score || a.date.localeCompare(b.date))
    return scored.slice(0, 20).map(s => s.row)
  } catch {
    return []
  }
}
