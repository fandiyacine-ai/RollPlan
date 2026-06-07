# RollPlan — Roadmap

Features in flight, prioritised, and parked. Update this file whenever something is scoped, started, or shipped.

---

## In Flight

Nothing actively in progress.

---

## Backlog (priority order)

### P1 — Build next

**Freemium paywall enforcement — inline UI polish**
Server-side enforcement is done: `submitScoutUrls` blocks at `analysedThisMonth >= FREE_MONTHLY_VIDEO_LIMIT` (5/month) via `checkMonthlyLimit`, with a clear upgrade message and a cap-reached lifecycle email (sends once/month). `importCommunityFootage` does NOT need gating — it clones existing analysed matches (reuses `videoId`, no new Gemini call, no quota consumed). What remains: proactive UI — disable the scout form / show the upgrade prompt inline *before* the user hits submit and gets blocked, rather than only reacting to the server error.

**Technique KB evaluation metrics & A/B test plan**
Define how we measure whether the KB is actually improving match analysis quality. Candidate metrics: detection recall/precision on match events, analysis completeness, and match-relevant insight accuracy. Plan an A/B experiment comparing current extraction prompt injection against the enriched KB with transcript/embedding-driven retrieval.

See `TECHNIQUE_KB_QUALITY_PLAN.md` for concrete implementation steps and the full experiment design.


### P2 — Soon

**UX Agent (on-demand)**
Domain-specific agent that knows BJJ competition prep, the athlete persona, and match-day pressure. Run it with `/ux-review` before any major UI release. It screenshots all key pages, maps the user journey against the 3 jobs-to-be-done (prep, match day, debrief), and outputs a prioritised list of gaps and fixes. System prompt includes: gi/no-gi context, bracket format, competition stress, what an athlete needs in 30 seconds vs 30 minutes.



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
| Free tier limit (5 videos analysed/month) | 2026-05-20 | Calendar-month reset, UI pill in nav. Limit lowered to 5 (`FREE_MONTHLY_VIDEO_LIMIT`) since this entry was written |
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
| Onboarding wizard | 2026-05-27 | Full-screen overlay for new users: choose tournament-prep or match-review path; catalog search, opponent + footage steps; `onboardingComplete` flag on users |
| Game Day tab — /game-day | 2026-05-27 | Upcoming tournaments only; opponent briefing cards with attack chain, open with/watch out, win %, confidence dots; ⚡ in bottom tab bar |
| AI confidence layer | 2026-05-27 | ●●● dots on gameplan header + low-confidence banner (≤1 match); per-insight dots in scouting view NotesTab |
| Technique KB transcript + semantic retrieval | 2026-05-27 | Ingest pipeline now stores YouTube transcripts/searchText/embeddings and uses semantic retrieval for technique variant selection; KB agent can queue narrated analysis videos. |
| Post-tournament result recording | 2026-05-27 | `userResult` / `userResultMethod` / `userResultTechnique` on `tournamentOpponents`; manual W/L widget on each opponent accordion card, visible after event date passes. |
| Fix / repurpose Sync button | 2026-05-27 | `syncBracketResults` now writes `userResult` on `tournamentOpponents` from Smoothcomp bracket. `saveOpponentResult` action for manual W/L override. |
| Player card — prescriptive redesign | 2026-05-27 | Control Rate verdict (Developing/Solid/Dominant) + tip; Priority gap callout with direct framing; Exposed positions show drill hints. |
| Smoothcomp profile in settings | 2026-05-27 | URL field on settings page, athlete ID parsed and stored; used to auto-deselect user from bracket import dialog. |
| Smart bracket pre-selection | 2026-05-27 | User's own entry auto-deselected and marked "That's you" in bracket import dialog. |
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
