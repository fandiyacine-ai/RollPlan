# FrameMatters — Roadmap

Features in flight, prioritised, and parked. Update this file whenever something is scoped, started, or shipped.

---

## In Flight

| Feature | Status | Notes |
|---|---|---|
| Gameplan print / PDF export | Not started | Print CSS + print button on Gameplan page |
| Scout form error catch | Not started | submitScoutUrls errors silently swallowed — UI hangs |

---

## Backlog (priority order)

### P1 — Build next

**Position correction UI**
Flag an incorrect position or event directly on the match detail timeline. Simple "wrong label" button per row, stores a correction record. The FAQ already describes this as working — it needs to be real.

**Plan-execution review**
After a competition, compare the generated gameplan against the actual match result. "You planned to attack the back — did you get there? Where did the plan break down?" Requires linking a match to the tournament gameplan that was generated for it.

### P2 — Soon

**Post-tournament engagement loop**
After a competition, close the loop with the athlete. Three touchpoints:
1. **Gameplan rating** — thumbs up / down + optional one-liner on the Gameplan page. Captured immediately after generating the plan or any time before the event. Stored against the gameplan so we can track plan quality over time.
2. **Post-event follow-up prompt** — if a tournament has a date set and it has passed, surface a prompt on the opponents page: *"How did it go?"* Simple outcome picker (Won bracket / Lost early / DNS) + free-text "what surprised you most?" Both fields are optional. Dismissable.
3. **Upload your footage** — the follow-up prompt includes a direct shortcut to upload their own match footage from that event so their personal match library stays current. Feeds Plan-execution review once built.

No email or push needed for v1 — just a persistent in-app banner tied to tournament date. Gate on `tournament.date` being set (already in schema? if not, add it).

**Match result on Gameplan page**
When viewing a Gameplan, show whether the scouted opponent won or lost the footage matches — gives W/L context to each clip.

**Opponent deduplication**
When adding a scout opponent, warn if the exact name already exists in another tournament: "We already have analysis for [Name] from [Tournament X] — add footage there instead?" Exact case-insensitive match only. Fuzzy matching is v2 (false-positive risk with common names).

**Bounding box overlays on key moments**
Gemini already estimates athlete bounding boxes during extraction. Wire them up as coloured overlay boxes (green = you, red = opponent) on the video at key event timestamps. Zero new infrastructure — just needs the UI.

### P3 — Later

**Smoothcomp bracket integration + cross-validation**

The single most valuable data unlock. Smoothcomp has no public API (confirmed — no docs, no known reverse-engineered endpoints). Three paths, build in order:

*Phase 1 — User-directed bracket fetch (build first)*
When a user creates a tournament, let them optionally paste their Smoothcomp competition URL. Scrape that one page at their direction — legally safer than bulk scraping because the user is sending you to their own data. From the bracket page:
- Extract all athletes in their division and weight class.
- Extract match results (winner, method) once the bracket is live.
- Use those results as **ground truth to override LLM extraction** — if Smoothcomp says Dario beat Toni Holm by submission, that wins over whatever the model guessed from the scoreboard. No more manual fixes.

This unlocks: verified W/L badges ("Confirmed via Smoothcomp"), and automatic opponent discovery (every athlete in their pool is a potential scouting target — offer to create an opponent record for each).

*Phase 2 — Pre-event proactive gameplans*
Once the bracket is published and seedings are known: *"You're in Pool B — 4 potential opponents, gameplans ready."* Scan available footage for every seeded opponent in the user's division automatically. Premium tier trigger.

*Phase 3 — Tournament catalog + social proof*
`canonical_tournaments` table populated from Smoothcomp competition list pages (scraped nightly for upcoming events), supplemented by a hand-curated seed of ~50 major recurring events (IBJJF Worlds/Euros/Pans, ADCC, AJP Grand Slam, Polaris). Users pick from the list instead of typing. Show anonymous count: *"14 athletes preparing for this event on FrameMatters."*

Catalog constraints (implement from day one):
- **BJJ only** — filter Smoothcomp scrape to `sport=jiu-jitsu`; verify discipline label in scraped results to exclude MMA/wrestling bleed-through.
- **Future events only** — only index events with `eventDate >= today`. Do not display or create records for past competitions.
- **Stale entry cleanup** — nightly cron: delete `canonical_tournaments` rows where `eventDate < yesterday` AND no user has linked the event (join count = 0). Keeps the catalog fresh without requiring manual curation.
- **No user-linked events** are ever auto-deleted — only catalog entries with zero users are pruned.

*Smoothcomp partnership — pursue in parallel*
Their incentive is real: usage data showing athletes prep on FrameMatters for Smoothcomp events is marketing data for them. Cold email with the pitch and a real API ask. If granted, replace scraping with clean endpoints.

*Data model addition:* `smoothcomp_url text`, `smoothcomp_competition_id text`, `bracket_fetched_at timestamptz` on tournaments table. `smoothcomp_athlete_id text`, `smoothcomp_verified boolean` on matches table.



**Verification pass (extraction quality)**
A second Inngest step after the main extraction: sends the video + extracted labels back to Gemini for a targeted review, correcting any segment it flags with ≥ 80% confidence disagreement. Adds ~1 min to analysis time but meaningfully reduces label errors.

**Long video chunking via FFmpeg**
For 4–6 hour full-day tournament streams. Current chunking works with YouTube time windows (no download). This path: download → FFmpeg split → N parallel Inngest events. Architecturally heavier. Build only once users are consistently struggling with the URL scan tab on long streams.

**Voice coaching / TTS**
Read the Match Report aloud. TTS route was partially wired — needs UI trigger and audio playback component.

---

## Shipped

| Feature | Shipped | Notes |
|---|---|---|
| Match result badge (W/L) on detail page header | 2026-05-19 | Shows method + technique |
| Timeline legend uses athlete names for scout footage | 2026-05-19 | Was "Your action / Opponent action" |
| Walkover match handling | 2026-05-19 | Detected in scan, skips extraction |
| Failure reasons surfaced to users | 2026-05-19 | Video rows show real error, not generic "failed" |
| Row titles use opponent name (not URL/format) | 2026-05-19 | Accordion footage list |
| ALL CAPS name matching for Smoothcomp | 2026-05-19 | Prompt v3 + chunking fallback |
| Free tier limit (10 analysed matches/month) | — | Calendar-month reset |
| Position flow diagram — circular layout | — | Cap 6 nodes, 9 edges |
| Player card share image (1080×1080) | — | Arc gauge, Arsenal/Exposed panels |
| Match narration / Match Report | — | Regeneratable coaching summary |
| Opponent scouting + Gameplan | — | Tournament → Opponent → Footage → Gameplan flow |
| Match analysis share link | — | /share/match/[shortId] public page |
| Frame by Frame AI coach | — | Per-segment video + coaching notes |
