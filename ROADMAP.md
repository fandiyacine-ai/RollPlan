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

**Match result on Gameplan page**
When viewing a Gameplan, show whether the scouted opponent won or lost the footage matches — gives W/L context to each clip.

**Opponent deduplication**
When adding a scout opponent, warn if the exact name already exists in another tournament: "We already have analysis for [Name] from [Tournament X] — add footage there instead?" Exact case-insensitive match only. Fuzzy matching is v2 (false-positive risk with common names).

**Bounding box overlays on key moments**
Gemini already estimates athlete bounding boxes during extraction. Wire them up as coloured overlay boxes (green = you, red = opponent) on the video at key event timestamps. Zero new infrastructure — just needs the UI.

### P3 — Later

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
