// Full end-to-end test of profile search + verification for all athletes
// Run this locally before firing any jobs in prod

const BRAVE_API_KEY = process.env.BRAVE_API_KEY
const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY

// ── helpers (copied from job to test in isolation) ──────────────────────────

async function fetchAjpEventsPage(athleteId: string, page: number) {
  const resp = await fetch(`https://ajptour.com/en/profile/${athleteId}/events?page=${page}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: `https://ajptour.com/en/profile/${athleteId}`,
      Origin: 'https://ajptour.com',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`AJP events ${resp.status}`)
  return resp.json() as Promise<{ data: Array<{ info: { id: number }; upcomingEvent: boolean; registrations: Array<{ matches: unknown[] }> }>; last_page: number }>
}

async function fetchScEventsPage(baseUrl: string, athleteId: string, page: number) {
  const resp = await fetch(`${baseUrl}/en/profile/${athleteId}/events?page=${page}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: `${baseUrl}/en/profile/${athleteId}`,
      Origin: baseUrl,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`SC events ${resp.status}`)
  return resp.json() as Promise<{ data: Array<{ info: { id: number }; upcomingEvent: boolean }>; last_page: number }>
}

async function verifyProfileName(
  eventsFetcher: (page: number) => Promise<{ data: Array<{ info: { id: number }; upcomingEvent: boolean }>; last_page: number }>,
  participantsUrl: (eventId: number) => string,
  athleteId: string,
  expectedName: string
): Promise<{ ok: boolean; foundName?: string }> {
  const page = await eventsFetcher(1)
  if (!page.data?.length) return { ok: false }
  const firstEvent = page.data.find(ev => !ev.upcomingEvent)
  if (!firstEvent) return { ok: false }

  const pResp = await fetch(participantsUrl(firstEvent.info.id), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  })
  if (!pResp.ok) return { ok: false }
  const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }

  const nameParts = expectedName.toLowerCase().split(/\s+/).filter(p => p.length > 1)
  const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)

  for (const participant of pData.participants ?? []) {
    for (const reg of participant.registrations ?? []) {
      if (String(reg.user_id) !== athleteId) continue
      const fullName = `${reg.firstname} ${reg.lastname}`
      const matchCount = nameParts.filter(p => fullName.toLowerCase().includes(p)).length
      return { ok: matchCount >= threshold, foundName: fullName }
    }
  }
  return { ok: false }
}

async function geminiSearch(query: string, domain: string): Promise<string[]> {
  if (!GOOGLE_API_KEY) return []
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: query }] }], tools: [{ google_search: {} }] }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!resp.ok) return []
  const data = await resp.json() as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> }
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const redirectUrls = chunks.map(c => c.web?.uri).filter((u): u is string => !!u && u.includes('grounding-api-redirect'))
  const realUrls: string[] = []
  for (const ru of redirectUrls) {
    try {
      const r = await fetch(ru, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) })
      const loc = r.headers.get('location')
      if (loc && loc.includes(domain)) realUrls.push(loc)
    } catch { continue }
  }
  return realUrls
}

// ── test one AJP athlete ─────────────────────────────────────────────────────

async function testAjp(name: string, knownCorrectId?: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`AJP search: "${name}"${knownCorrectId ? ` (expected ID: ${knownCorrectId})` : ''}`)

  // Brave
  let candidateIds: string[] = []
  if (BRAVE_API_KEY) {
    for (const q of [`"${name}" site:ajptour.com`, `${name} ajptour.com profile`]) {
      const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, {
        headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }).catch(() => null)
      if (!resp?.ok) continue
      const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
      const ids = (data.web?.results ?? []).flatMap(r => {
        const m = r.url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
        return m ? [m[1]] : []
      })
      if (ids.length) { candidateIds = [...new Set(ids)]; break }
    }
    console.log(`  Brave found IDs: ${candidateIds.length ? candidateIds.join(', ') : 'none'}`)
  }

  // Gemini
  if (!candidateIds.length) {
    const urls = await geminiSearch(
      `Find the ajptour.com profile page for BJJ athlete "${name}". Return URLs like https://ajptour.com/en/profile/NUMBER`,
      'ajptour.com'
    )
    candidateIds = [...new Set(urls.flatMap(u => { const m = u.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/); return m ? [m[1]] : [] }))]
    console.log(`  Gemini found IDs: ${candidateIds.length ? candidateIds.join(', ') : 'none'}, from URLs: ${urls.join(' | ')}`)
  }

  for (const id of candidateIds) {
    const result = await verifyProfileName(
      (p) => fetchAjpEventsPage(id, p),
      (evId) => `https://ajptour.com/en/event/${evId}/participants`,
      id, name
    )
    const status = result.ok ? '✓ MATCH' : '✗ REJECT'
    const note = result.foundName ? `registered as "${result.foundName}"` : 'not found in participants'
    console.log(`  ID ${id}: ${status} — ${note}`)
    if (result.ok) {
      const isCorrect = !knownCorrectId || id === knownCorrectId
      console.log(`  → WILL USE: ${id} ${isCorrect ? '✓ correct' : `✗ WRONG (expected ${knownCorrectId})`}`)
    }
  }
  if (!candidateIds.length) console.log('  → no candidates found')
}

// ── test one Smoothcomp athlete ──────────────────────────────────────────────

async function testSmoothcomp(name: string, knownWrongIds: string[] = []) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Smoothcomp search: "${name}"`)

  let candidateUrls: string[] = []
  if (BRAVE_API_KEY) {
    for (const q of [`"${name}" site:smoothcomp.com profile`, `${name} smoothcomp.com`]) {
      const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, {
        headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }).catch(() => null)
      if (!resp?.ok) continue
      const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
      const urls = (data.web?.results ?? []).map(r => r.url).filter(u => u.includes('smoothcomp.com'))
      if (urls.length) { candidateUrls = urls; break }
    }
    console.log(`  Brave URLs: ${candidateUrls.length ? candidateUrls.slice(0, 3).join(' | ') : 'none'}`)
  }

  if (!candidateUrls.length) {
    candidateUrls = await geminiSearch(
      `Find smoothcomp.com profile for BJJ athlete "${name}". Return URL like https://smoothcomp.com/en/profile/NUMBER`,
      'smoothcomp.com'
    )
    console.log(`  Gemini URLs: ${candidateUrls.length ? candidateUrls.join(' | ') : 'none'}`)
  }

  const profileRe = /^(https?:\/\/(?:[a-z0-9-]+\.)?smoothcomp\.com)\/[a-z]{0,5}\/profile\/(\d+)/
  for (const url of candidateUrls) {
    const m = url.match(profileRe)
    if (!m) continue
    const [, baseUrl, athleteId] = m
    const result = await verifyProfileName(
      (p) => fetchScEventsPage(baseUrl, athleteId, p),
      (evId) => `${baseUrl}/en/event/${evId}/participants`,
      athleteId, name
    )
    const isKnownWrong = knownWrongIds.includes(athleteId)
    const status = result.ok ? '✓ MATCH' : '✗ REJECT'
    const note = result.foundName ? `registered as "${result.foundName}"` : 'not found in participants'
    console.log(`  ${baseUrl}/profile/${athleteId}: ${status} — ${note}${isKnownWrong ? ' (KNOWN WRONG)' : ''}`)
  }
  if (!candidateUrls.some(u => u.match(profileRe))) console.log('  → no direct profile URLs found in candidates')
}

// ── run all tests ────────────────────────────────────────────────────────────

async function main() {
  console.log('Testing profile search + name verification\n')

  await testAjp('Yacine Fandi', '139720')
  await testAjp('Nihate Pahati')
  await testSmoothcomp('Nihate Pahati', ['2756656'])

  console.log(`\n${'─'.repeat(60)}`)
  console.log('Done.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
