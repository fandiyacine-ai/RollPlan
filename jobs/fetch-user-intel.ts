import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { currentUser } from '@clerk/nextjs/server'
import {
  normalizeName,
  nameMatchThreshold,
  findAjpAthleteIdByName,
  verifySmoothcompProfileName,
  findSmoothcompProfiles,
  fetchSmoothcompEventsPage,
  fetchAjpEventsPage,
  fetchBjjmetricsMedalCounts,
  type AjpEventsPage,
} from './build-opponent-intel'

export const fetchUserIntel = inngest.createFunction(
  {
    id: 'fetch-user-intel',
    name: 'Fetch User Competition Record',
    triggers: [{ event: 'user/fetch-intel' }],
    retries: 1,
    rateLimit: { limit: 5, period: '1m' },
    concurrency: [{ limit: 1, key: 'event.data.userId' }],
  },
  async ({ event, step }: {
    event: { data: { userId: string; athleteName: string } }
    step: any
  }) => {
    const { userId, athleteName } = event.data

    await step.run('mark-running', () =>
      db.update(users).set({ intelStatus: 'running' }).where(eq(users.id, userId))
    )

    const user = await step.run('load-user', () =>
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { smoothcompAthleteId: true, smoothcompProfileUrl: true, ajpAthleteId: true },
      })
    )

    // ── AJP ──────────────────────────────────────────────────────────────────
    const ajpAthleteId: string | null = await step.run('find-ajp-id', async () => {
      if (user?.ajpAthleteId) return user.ajpAthleteId
      // AJP = Smoothcomp platform — same athlete ID
      if (user?.smoothcompAthleteId) {
        await db.update(users)
          .set({ ajpAthleteId: user.smoothcompAthleteId, ajpProfileUrl: `https://ajptour.com/en/profile/${user.smoothcompAthleteId}` })
          .where(eq(users.id, userId))
        return user.smoothcompAthleteId
      }
      const ajpId = await findAjpAthleteIdByName(athleteName)
      if (ajpId) {
        await db.update(users)
          .set({ ajpAthleteId: ajpId, ajpProfileUrl: `https://ajptour.com/en/profile/${ajpId}` })
          .where(eq(users.id, userId))
      }
      return ajpId
    })

    if (ajpAthleteId) {
      await step.run('fetch-ajp-totals', async () => {
        try {
          let wins = 0, losses = 0
          const firstPage = await fetchAjpEventsPage(ajpAthleteId, 1)
          const allPages: AjpEventsPage['data'] = [...(firstPage.data ?? [])]
          for (let p = 2; p <= (firstPage.last_page ?? 1); p++) {
            const page = await fetchAjpEventsPage(ajpAthleteId, p)
            allPages.push(...(page.data ?? []))
          }
          for (const ev of allPages) {
            if (ev.upcomingEvent) continue
            for (const reg of ev.registrations) {
              if (!reg.published && reg.matches.length === 0) continue
              wins += reg.matches.filter((m: any) => m.is_winner).length
              losses += reg.matches.filter((m: any) => !m.is_winner).length
            }
          }
          if (wins > 0 || losses > 0) {
            await db.update(users).set({ ajpWins: wins, ajpLosses: losses }).where(eq(users.id, userId))
          }
          return { wins, losses }
        } catch { return { skipped: true } }
      })
    }

    // ── Smoothcomp ────────────────────────────────────────────────────────────
    await step.run('fetch-smoothcomp-totals', async () => {
      try {
        const storedScId = user?.smoothcompAthleteId ?? null
        let profiles: Array<{ baseUrl: string; athleteId: string }> = []
        if (storedScId) {
          const verified = await verifySmoothcompProfileName(storedScId, athleteName)
          if (verified) profiles = [{ baseUrl: 'https://smoothcomp.com', athleteId: storedScId }]
        }
        if (profiles.length === 0) {
          profiles = await findSmoothcompProfiles(athleteName)
        }
        if (profiles.length === 0) return { wins: 0, losses: 0 }

        let wins = 0, losses = 0
        for (const { baseUrl, athleteId: scId } of profiles) {
          try {
            const firstPage = await fetchSmoothcompEventsPage(baseUrl, scId, 1)
            const allPages = [...(firstPage.data ?? [])]
            for (let p = 2; p <= (firstPage.last_page ?? 1); p++) {
              const page = await fetchSmoothcompEventsPage(baseUrl, scId, p)
              allPages.push(...(page.data ?? []))
            }
            for (const ev of allPages) {
              if (ev.upcomingEvent) continue
              for (const reg of ev.registrations) {
                if (!reg.published && reg.matches.length === 0) continue
                wins += reg.matches.filter((m: any) => m.is_winner).length
                losses += reg.matches.filter((m: any) => !m.is_winner).length
              }
            }
          } catch { continue }
        }

        const fedUrl = `https://smoothcomp.com/en/profile/${profiles[0].athleteId}`
        if (wins > 0 || losses > 0) {
          await db.update(users).set({ smoothcompWins: wins, smoothcompLosses: losses, smoothcompFedUrl: fedUrl }).where(eq(users.id, userId))
        } else {
          await db.update(users).set({ smoothcompFedUrl: fedUrl }).where(eq(users.id, userId))
        }
        return { wins, losses }
      } catch { return { skipped: true } }
    })

    // ── IBJJF medals ─────────────────────────────────────────────────────────
    await step.run('fetch-ibjjf-totals', async () => {
      const dbUpdate: Record<string, unknown> = {}
      let bjjmetricsExactSlug: string | null = null

      try {
        const searchResp = await fetch('https://bjjmetrics.com/search_ibjjf_matches_names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({ name: athleteName }),
          signal: AbortSignal.timeout(15000),
        })
        if (searchResp.ok) {
          const searchData = await searchResp.json() as { success: boolean; names?: Array<{ name: string }> }
          if (searchData.success && searchData.names?.length) {
            const exactName = searchData.names[0].name
            const matchesResp = await fetch('https://bjjmetrics.com/get_ibjjf_matches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
              body: JSON.stringify({ name: exactName }),
              signal: AbortSignal.timeout(15000),
            })
            if (matchesResp.ok) {
              const matchesData = await matchesResp.json() as { success: boolean; matches?: Array<unknown> }
              if (matchesData.success && matchesData.matches?.length) {
                const fighterSlug = exactName.toLowerCase().replace(/\s+/g, '-')
                dbUpdate.ibjjfProfileUrl = `https://bjjmetrics.com/fighter/${fighterSlug}`
                bjjmetricsExactSlug = fighterSlug
              }
            }
          }
        }
      } catch { /* non-fatal */ }

      try {
        const PLACE_LABEL: Record<number, string> = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' }
        const nameParts = athleteName.trim().split(/\s+/)
        const normalizedSlugName = normalizeName(athleteName).replace(/\s+/g, '-')
        const slugVariants = [
          ...(bjjmetricsExactSlug ? [bjjmetricsExactSlug] : []),
          athleteName.toLowerCase().replace(/\s+/g, '-'),
          normalizedSlugName,
          ...(nameParts.length > 2 ? [`${nameParts[0]}-${nameParts[nameParts.length - 1]}`.toLowerCase()] : []),
        ].filter((s, i, arr) => arr.indexOf(s) === i)

        for (const slug of slugVariants) {
          const athleteResp = await fetch(
            `https://jiujitsu.net/api/athlete/${slug}?gi=true&all_medals=false`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) }
          )
          if (!athleteResp.ok) continue
          const body = await athleteResp.json() as {
            athlete?: { name?: string }
            medals?: Array<{ place: number; event_name: string; happened_at?: string; event_medals_only?: boolean | null }>
          }
          const foundName = normalizeName(body.athlete?.name ?? '')
          const namePartsLower = normalizeName(athleteName).split(/\s+/).filter(p => p.length > 1)
          const matchCount = namePartsLower.filter(p => foundName.includes(p)).length
          if (matchCount < nameMatchThreshold(namePartsLower)) continue

          const medals = body.medals ?? []
          if (!medals.length) break

          const eventMap = new Map<string, typeof medals[0]>()
          for (const medal of medals) {
            const key = medal.event_name.replace(/\s*\(Results\)\s*$/i, '').trim()
            const existing = eventMap.get(key)
            if (!existing) {
              eventMap.set(key, medal)
            } else if (medal.event_medals_only === true && existing.event_medals_only !== true) {
              eventMap.set(key, medal)
            } else if (medal.event_medals_only === existing.event_medals_only && medal.place < existing.place) {
              eventMap.set(key, medal)
            }
          }
          const sorted = [...eventMap.values()].sort((a, b) => a.place - b.place)
          dbUpdate.ibjjfBestResult = sorted.map(m => {
            const label = PLACE_LABEL[m.place] ?? `${m.place}th`
            const year = m.happened_at ? new Date(m.happened_at).getFullYear() : null
            const yearStr = year ? String(year) : null
            const nameHasYear = yearStr && m.event_name.includes(yearStr)
            return nameHasYear ? `${label} – ${m.event_name}` : year ? `${label} – ${m.event_name} ${year}` : `${label} – ${m.event_name}`
          }).join('|')
          break
        }
      } catch { /* non-fatal */ }

      // Fallback: jiujitsu.net had no medals — try bjjmetrics career medal counts
      if (!dbUpdate.ibjjfBestResult && bjjmetricsExactSlug) {
        const medalCounts = await fetchBjjmetricsMedalCounts(bjjmetricsExactSlug)
        if (medalCounts) dbUpdate.ibjjfBestResult = medalCounts
      }

      if (Object.keys(dbUpdate).length > 0) {
        await db.update(users).set(dbUpdate as any).where(eq(users.id, userId))
      }
      return dbUpdate
    })

    await step.run('mark-done', () =>
      db.update(users).set({ intelStatus: 'done' }).where(eq(users.id, userId))
    )

    return { ok: true }
  }
)
