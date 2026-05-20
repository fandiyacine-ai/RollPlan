# FrameMatters — Roadmap

Features in flight, prioritised, and parked. Update this file whenever something is scoped, started, or shipped.

---

## In Flight

Nothing actively in progress.

---

## Backlog (priority order)

### P1 — Build next

**Re-analyse failed matches**
A "Re-scan" button on failed footage rows so the user doesn't have to delete and re-add the URL. Should dedup correctly against the existing video record and fire a new `url/submitted` event.

**Position correction UI**
Flag an incorrect position or event directly on the match detail timeline. Simple "wrong label" button per row, stores a correction record. The FAQ describes this as working — it needs to be real.

**Plan-execution review**
After a competition, compare the generated gameplan against the actual match result. "You planned to attack the back — did you get there? Where did the plan break down?" Requires linking a post-event match upload to the tournament gameplan.

### P2 — Soon

**FAQ update**
Reflect all features shipped since the last FAQ revision: scout opponent flow, bracket import, gameplan generating state, footage nudge, edit opponent, transient error resilience, post-event banner.

**Opponent deduplication**
When adding a scout opponent, warn if the exact name already exists in another tournament: "We already have analysis for [Name] from [Tournament X] — add footage there instead?" Exact case-insensitive match only. Fuzzy matching is v2 (false-positive risk with common names).

**Match result on Gameplan page**
When viewing a Gameplan, show W/L context for each scouted match — gives the reader confidence about how reliable the footage sample is.

**Bounding box overlays on key moments**
Gemini already estimates athlete bounding boxes during extraction. Wire them up as coloured overlay boxes (green = you, red = opponent) on the video at key event timestamps. Zero new infrastructure — just needs the UI.

**Smoothcomp bracket Phase 2 — pre-event proactive gameplans**
Once a bracket is imported and the draw is known: *"You're in Pool B — 4 potential opponents, gameplans ready."* Scan available Smoothcomp footage for every seeded opponent in the user's division automatically. Premium tier trigger.

### P3 — Later

**Smoothcomp bracket Phase 3 — tournament catalog**
`canonical_tournaments` table populated from Smoothcomp competition list pages (scraped nightly for upcoming BJJ events), supplemented by a hand-curated seed of ~50 major recurring events (IBJJF Worlds/Euros/Pans, ADCC, AJP Grand Slam, Polaris). Users pick from the list instead of typing. Show anonymous count: *"14 athletes preparing for this event."*

Catalog constraints:
- **BJJ only** — filter Smoothcomp scrape to `sport=jiu-jitsu`
- **Future events only** — only index events with `eventDate >= today`
- **Stale entry cleanup** — nightly cron: delete rows where `eventDate < yesterday` AND zero users linked the event

*Smoothcomp partnership — pursue in parallel.* Their incentive is real: athlete prep data is marketing data for them. Cold email with the pitch and an API ask. If granted, replace scraping with clean endpoints.

**Long video chunking via FFmpeg**
For 4–6 hour full-day tournament streams. Current chunking works with YouTube time windows (no download). This path: download → FFmpeg split → N parallel Inngest events. Build only once users consistently struggle with long YouTube streams.

**Voice coaching / TTS**
Read the Match Report aloud. TTS route was partially wired — needs UI trigger and audio playback component.

---

## Shipped

| Feature | Shipped | Notes |
|---|---|---|
| Bracket import — import opponents from Smoothcomp bracket | 2026-05-20 | Selection dialog, dedup, footageStatus: pending |
| Edit opponent (name + seeding notes) | 2026-05-20 | Pencil icon on each accordion card |
| Footage nudge banner | 2026-05-20 | Amber banner when opponents have no footage |
| Gameplan generating state + auto-refresh | 2026-05-20 | API writes 'generating' row; page polls every 5s |
| Active tab highlighting (Opponents / Gameplan) | 2026-05-20 | TournamentNav client component, usePathname |
| Transient scan errors resilient | 2026-05-20 | SyntaxError / Internal error → RetryAfterError in all 3 catch sites |
| Scan-for-matches stays in 'processing' during retries | 2026-05-20 | Was permanently marking failed mid-retry |
| Edit tournament button inside tournament layout | 2026-05-20 | Pencil icon next to tournament title |
| Fix edit tournament dialog (stopPropagation bug) | 2026-05-20 | DialogTrigger was blocked by inner Button |
| Gameplan rating (thumbs up / down) | 2026-05-19 | Stored on gameplans.rating |
| Post-event banner (outcome prompt) | 2026-05-19 | Shown when event date passed + no outcome set |
| AI disclaimer + sync hint on opponents page | 2026-05-19 | Shown when no bracket URL linked |
| Sync results from bracket | 2026-05-19 | Corrects W/L from published Smoothcomp bracket |
| YouTube timestamp parsing (26m10s, 1h4m, etc.) | 2026-05-19 | parseYouTubeTimestamp handles all formats |
| Extraction timestamp shift fix (skipScan + chunkOffset) | 2026-05-19 | clipStart applied correctly to all positions/events |
| Frame by Frame nav forwards back= param | 2026-05-19 | Scout Opponent tab now highlighted correctly |
| Old failed parent video hidden once matches exist | 2026-05-19 | Accordion filter + allChunksFailed guard |
| Chunk scan failure — INVALID_ARGUMENT → NonRetriableError | 2026-05-19 | Parent video marked failed correctly |
| YouTube &t= stripped before Gemini fileUri | 2026-05-19 | cleanYouTubeUrl() in gemini-video.ts |
| YouTube timestamp tip in scout form | 2026-05-19 | "Copy video URL at current time" hint |
| Auto-refresh on opponents page during scans | 2026-05-19 | <AutoRefresh /> polls every 4s |
| Chunk progress bar + failed chunk detection | 2026-05-19 | chunksFailed count, allChunksFailed guard |
| Match result badge (W/L) on detail page header | 2026-05-19 | Shows method + technique |
| Timeline legend uses athlete names for scout footage | 2026-05-19 | Was "Your action / Opponent action" |
| Walkover match handling | 2026-05-19 | Detected in scan, skips extraction |
| Failure reasons surfaced to users | 2026-05-19 | Video rows show real error, not generic "failed" |
| Row titles use opponent name (not URL/format) | 2026-05-19 | Accordion footage list |
| Scout form error catch | — | submitScoutUrls errors now surface to user |
| Gameplan print button | — | PrintButton on Gameplan page |
| Free tier limit (10 analysed matches/month) | — | Calendar-month reset |
| Position flow diagram — circular layout | — | Cap 6 nodes, 9 edges |
| Player card share image (1080×1080) | — | Arc gauge, Arsenal/Exposed panels |
| Match narration / Match Report | — | Regeneratable coaching summary |
| Opponent scouting + Gameplan | — | Tournament → Opponent → Footage → Gameplan flow |
| Match analysis share link | — | /share/match/[shortId] public page |
| Frame by Frame AI coach | — | Per-segment video + coaching notes |
| Position verification pass | — | Second Gemini pass on low-confidence segments |
