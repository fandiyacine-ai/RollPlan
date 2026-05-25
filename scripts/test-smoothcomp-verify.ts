// Test verifySmoothcompProfileName against known wrong profile 1040084 for "Yacine Fandi"
// Expected: false (wrong person)

async function fetchSmoothcompEventsPage(baseUrl: string, athleteId: string, page: number) {
  const resp = await fetch(`${baseUrl}/en/profile/${athleteId}/events?page=${page}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: `${baseUrl}/en/profile/${athleteId}`,
      Origin: baseUrl,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`${resp.status}`)
  return resp.json() as Promise<{ data: Array<{ info: { id: number }; upcomingEvent: boolean; registrations: unknown[] }>; last_page: number }>
}

async function verifySmoothcompProfileName(baseUrl: string, athleteId: string, expectedName: string): Promise<boolean> {
  const page = await fetchSmoothcompEventsPage(baseUrl, athleteId, 1)
  if (!page.data?.length) { console.log('  → no events'); return false }
  const firstEvent = page.data.find(ev => !ev.upcomingEvent)
  if (!firstEvent) { console.log('  → no non-upcoming events'); return false }

  console.log(`  → first event ID: ${firstEvent.info.id}`)
  const pResp = await fetch(`${baseUrl}/en/event/${firstEvent.info.id}/participants`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  })
  if (!pResp.ok) { console.log('  → participants fetch failed:', pResp.status); return false }

  const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
  const nameParts = expectedName.toLowerCase().split(/\s+/).filter(p => p.length > 1)
  const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)
  console.log(`  → looking for user_id=${athleteId} with nameParts=${JSON.stringify(nameParts)} (threshold=${threshold})`)

  for (const participant of pData.participants ?? []) {
    for (const reg of participant.registrations ?? []) {
      if (String(reg.user_id) === athleteId) {
        const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
        const matchCount = nameParts.filter(p => fullName.includes(p)).length
        console.log(`  → FOUND user_id ${athleteId}: "${reg.firstname} ${reg.lastname}" — matchCount=${matchCount}/${threshold}`)
        return matchCount >= threshold
      }
    }
  }
  console.log(`  → user_id ${athleteId} not found in participants`)
  return false
}

async function main() {
  const BASE = 'https://smoothcomp.com'

  // Test 1: wrong profile 1040084 for "Yacine Fandi" — must return FALSE
  console.log('\nTest 1: profile 1040084 for "Yacine Fandi" (expected: FALSE)')
  const r1 = await verifySmoothcompProfileName(BASE, '1040084', 'Yacine Fandi')
  console.log(`  RESULT: ${r1} → ${r1 === false ? 'PASS ✓' : 'FAIL ✗ (wrong profile was accepted)'}`)

  // Test 2: wrong profile for "Nihate Pahati" — 2756656 — verify what name this person has
  console.log('\nTest 2: profile 2756656 for "Nihate Pahati" (expected: TRUE if correct)')
  const r2 = await verifySmoothcompProfileName(BASE, '2756656', 'Nihate Pahati')
  console.log(`  RESULT: ${r2} → ${r2 ? 'ACCEPTED' : 'REJECTED'}`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
