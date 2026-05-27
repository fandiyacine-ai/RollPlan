# RollPlan — Roadmap

Features in flight, prioritised, and parked. Update this file whenever something is scoped, started, or shipped.

---

## In Flight

Nothing actively in progress.

---

## Backlog (priority order)

### P1 — Build next

**Match Day tab — "Game Day" surface**
New top-level nav item. Lists all upcoming tournaments sorted by date with countdown. Tap tournament → see all opponents as scannable game cards (not full gameplans). Each card: 3 priority moves, 1 danger, confidence score, result prediction. Zero extra taps on match day. Mobile-first design — this is the hero screen for the native app.

**AI confidence scores — transparency layer**
Every gameplan and analysis insight shows a confidence indicator (●●● high / ●●○ medium / ●○○ low) driven by: number of matches scouted, recency of footage, competition vs training context. Gameplan header shows: "Based on 1 match from 2024 — treat as directional." Individual insight cards show their own confidence. Builds trust by being honest about AI limitations.

**Gameplan format redesign — cards not prose**
Replace the long-form article with structured cards: Attack priorities (top 3), Danger zones (top 2), Key scenario ("if he pulls guard, do X"), Ruleset reminders. Same AI output, different presentation. Scannable in 30 seconds on match day.

**Freemium paywall enforcement**
Block `submitFootageUrls` / `importCommunityFootage` when `analysedThisMonth >= 10`. Show upgrade prompt inline (scout form disabled, message shown). Free tier limit exists in DB and is displayed on `/usage` — enforcement wall is the missing piece.

**Technique KB evaluation metrics & A/B test plan**
Define how we measure whether the KB is actually improving match analysis quality. Candidate metrics: detection recall/precision on match events, analysis completeness, and match-relevant insight accuracy. Plan an A/B experiment comparing current extraction prompt injection against the enriched KB with transcript/embedding-driven retrieval.

See `TECHNIQUE_KB_QUALITY_PLAN.md` for concrete implementation steps and the full experiment design.


### P2 — Soon

**UX Agent (on-demand)**
Domain-specific agent that knows BJJ competition prep, the athlete persona, and match-day pressure. Run it with `/ux-review` before any major UI release. It screenshots all key pages, maps the user journey against the 3 jobs-to-be-done (prep, match day, debrief), and outputs a prioritised list of gaps and fixes. System prompt includes: gi/no-gi context, bracket format, competition stress, what an athlete needs in 30 seconds vs 30 minutes.

**Onboarding flow — first-time user**
New users land on an empty player card with no guidance. Needs: step-by-step wizard (create tournament → add opponent → add footage), or at minimum a contextual empty state that drives the first action. Without this, any paid acquisition is wasted.

**Player card redesign — prescriptive not descriptive**
Replace "39% control rate" with "Your guard retention is your biggest gap — you get put on your back 60% of the time." Data stays the same; framing becomes actionable. Each stat card answers "so what?" and "what to drill."

**User's own Smoothcomp profile in settings**
Add Smoothcomp profile URL field to settings page. Parse and store `smoothcompAthleteId` for the user. Unlocks: (1) auto-sync post-tournament results from bracket, (2) smart bracket pre-selection (filter out self, pre-select only plausible opponents).

**Smart bracket opponent pre-selection**
When importing from bracket, pre-select only athletes in the same half of the elimination draw (the opponents Yacine could realistically face). Currently defaults to all athletes. Requires knowing user's own athlete position in the bracket.

**Per-match result override on match detail page**
Small "Correct result" UI on the match analysis page — dropdown Win/Loss + method. Stores directly to `resultWinner` / `resultMethod` on that match. For when the AI extracted the result wrong and you want to fix just one match without a full bracket sync.

### P3 — Later

**Long video chunking via FFmpeg**
For 4–6 hour full-day tournament streams. Current chunking works with YouTube time windows (no download). This path: download → FFmpeg split → N parallel Inngest events. Build only once users consistently struggle with long YouTube streams.

**Voice coaching / TTS**
Read the Match Report aloud. TTS route was partially wired — needs UI trigger and audio playback component.

**Smoothcomp partnership**
Their incentive is real: athlete prep data is marketing data for them. Cold email with the pitch and an API ask. If granted, replace all scraping with clean endpoints.

---

## Shipped

| Feature | Shipped | Notes |
|---|---|---|
| YouTube URL dedup — clone analysis on resubmit | 2026-05-20 | Same YouTube URL → clone from DB, skip Gemini. Quota still decrements |
| Cross-user Smoothcomp community footage | 2026-05-20 | "X community" import button on opponent cards with matching smoothcompAthleteId |
| Org-branded ruleset badges (IBJJF, AJP, ADCC, EBI) | 2026-05-20 | Inline SVG icons, solid colours, shared RulesetBadge component |
| Usage tracking — /usage page | 2026-05-20 | Monthly limit bar, this-month + all-time stats (matches, video minutes, opponents, gameplans) |
| Admin usage dashboard — /admin/usage | 2026-05-20 | Per-user table: analyses, video minutes, gameplans, AI cost. Guarded by ADMIN_CLERK_USER_ID env var |
| aiCallLogs userId attribution | 2026-05-20 | All AI job calls now write userId to ai_call_logs |
| Bracket import — inline URL capture | 2026-05-20 | capture-url and linking phases wired in import dialog |
| Free tier limit (10 analysed matches/month) | 2026-05-20 | Calendar-month reset, UI pill in nav |
| Tournament event picker (catalog) | 2026-05-20 | Searchable list of ~25 major 2026 events pre-fills create form |
| Matchup prediction | 2026-05-20 | AI win probability per opponent; Tournament Outlook card on Opponents page |
| Re-scan failed footage | 2026-05-20 | Re-scan button on failed video rows; resets video + chunk records, re-fires url/submitted |
| Position correction UI | 2026-05-20 | "Wrong?" button on each timeline position row; inline dropdown; marks userCorrected=true |
| Match result strip on Gameplan page | 2026-05-20 | W/L badges from scouted matches shown under header |
| Plan-execution review | 2026-05-20 | Link own analysed match to gameplan; planExecutions table; post-match section |
| Opponent deduplication warning | 2026-05-20 | Warns when same name exists in another tournament; force-add option |
| Smoothcomp Phase 2 — auto footage discovery on import | 2026-05-20 | Fires smoothcomp/discover.footage for each imported athlete |
| Bracket import — import opponents from Smoothcomp bracket | 2026-05-20 | Selection dialog, dedup, footageStatus: pending |
| Edit opponent (name + seeding notes) | 2026-05-20 | Pencil icon on each accordion card |
| Footage nudge banner | 2026-05-20 | Amber banner when opponents have no footage |
| Technique KB transcript + semantic retrieval | 2026-05-27 | Ingest pipeline now stores YouTube transcripts/searchText/embeddings and uses semantic retrieval for technique variant selection; KB agent can queue narrated analysis videos. |
| Post-tournament result recording | 2026-05-27 | `userResult` / `userResultMethod` / `userResultTechnique` on `tournamentOpponents`; manual W/L widget on each opponent accordion card, visible after event date passes. |
| Fix / repurpose Sync button | 2026-05-27 | `syncBracketResults` now writes `userResult` on `tournamentOpponents` from Smoothcomp bracket. `saveOpponentResult` action for manual W/L override. |
| Gameplan generating state + auto-refresh | 2026-05-20 | API writes 'generating' row; page polls every 5s |
| Edit tournament button inside tournament layout | 2026-05-20 | Pencil icon next to tournament title |
| Gameplan rating (thumbs up / down) | 2026-05-19 | Stored on gameplans.rating |
| Post-event banner (outcome prompt) | 2026-05-19 | Shown when event date passed + no outcome set |
| Sync results from bracket | 2026-05-19 | ⚠️ Semantically broken — updates scouted footage results, not user's tournament results. To be reworked under P1 |
| YouTube timestamp parsing (26m10s, 1h4m, etc.) | 2026-05-19 | parseYouTubeTimestamp handles all formats |
| Auto-refresh on opponents page during scans | 2026-05-19 | AutoRefresh polls every 4s |
| Chunk progress bar + failed chunk detection | 2026-05-19 | chunksFailed count, allChunksFailed guard |
| Match result badge (W/L) on detail page header | 2026-05-19 | Shows method + technique |
| Walkover match handling | 2026-05-19 | Detected in scan, skips extraction |
| Failure reasons surfaced to users | 2026-05-19 | Video rows show real error, not generic "failed" |
| Gameplan print button | — | PrintButton on Gameplan page |
| Position flow diagram — circular layout | — | Cap 6 nodes, 9 edges |
| Player card share image (1080×1080) | — | Arc gauge, Arsenal/Exposed panels |
| Match narration / Match Report | — | Regeneratable coaching summary |
| Match analysis share link | — | /share/match/[shortId] public page |
| Frame by Frame AI coach | — | Per-segment video + coaching notes |
