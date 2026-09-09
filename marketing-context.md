# RollPlan — Marketing Context

*Last updated: 2026-06-11*

---

## Product Overview

**One-liner:** RollPlan turns BJJ competition footage into AI-powered match analysis, opponent scouting, and competition-day gameplans — automatically.

**What it does:**
RollPlan analyses Brazilian Jiu-Jitsu match videos using Google Gemini AI. Upload or link footage and the app produces a full position-by-position breakdown with timestamps, key event detection (submissions, sweeps, takedowns, guard passes), coaching notes, and pattern analysis. Athletes also use it to scout opponents: import a bracket from AJP, IBJJF, or Smoothcomp and RollPlan pulls each opponent's record and footage automatically — or paste a long tournament stream and tell the AI who to look for, and it scans the full recording to clip out that athlete's matches. Each scouted opponent gets an AI gameplan with a win probability (Favourable/Even/Tough), which can be turned into a Fight Card — a shareable head-to-head page for your coach or squad. On Match Day, a single-screen briefing shows the key attack to open with and the danger to watch for each opponent in the draw.

**Product category:** Sports performance analytics / AI sports coaching tool
**Product type:** SaaS web app (mobile app in development)
**Business model:** Freemium — 10 analyses/month free; paid tier for unlimited analysis + advanced features (pricing TBD, launching soon)
**Stage:** Active beta — core features ship-quality, mobile app not yet released
**URL:** rollplan.app (production on Railway)

---

## Target Audience

**Who uses it:** Competitive Brazilian Jiu-Jitsu (BJJ) athletes — both gi and no-gi competitors

**Target competitor profile:**
- Competes at IBJJF, AJP, ADCC-style, EBI, local open events
- Any belt, any age — adult competitors and youth competitors (kids division); parents of competing kids are also a key user group (managing prep for a child whose parent doesn't train themselves)
- Primary focus: competitors who are serious but don't have access to a full coaching staff
- Trains 3–5 sessions/week minimum
- Has competition footage (YouTube, self-recorded, event streams)
- Cares about improving and preparing specifically for upcoming events

**Geographic focus:** Initially Finland + broader Europe; English-language product

**Jobs to be done:**
1. **"Help me prepare for THIS opponent"** — tournament scouting, gameplan generation, footage analysis before a specific event
2. **"What do I do RIGHT NOW in the arena?"** — match day, standing in the sports hall with adrenaline, needs ONE key attack + danger in one glance, 5 seconds
3. **"What do I need to improve?"** — post-match debrief, pattern recognition across multiple matches, drill target identification

**Primary use case:** Tournament prep — competitor imports bracket from Smoothcomp, scouts opponents automatically, generates gameplans, reviews on competition morning

---

## Personas

| Persona | Description | What they care about | Their challenge | Value RollPlan promises |
|---------|-------------|---------------------|-----------------|------------------------|
| **The Self-Coached Competitor** | Blue–purple belt, no personal coach, competes 4–8 times/year | Improving consistently, not flying blind at events | No feedback loop — watches footage but doesn't know what to fix | Structured analysis every match — patterns emerge, drills become specific |
| **The Prep-Obsessed Competitor** | Purple–brown belt, trains seriously, treats each tournament like a test | Having an edge going in — knowing what opponent likes to do | Hours spent manually watching opponent footage, notes scattered | Automated scouting pipeline — paste a URL, get a gameplan in minutes |
| **The Coach-Athlete** | High-level competitor who also coaches students | Efficiency — needs to prepare multiple athletes for events | Too much footage, too little time | Scales their analysis capacity — runs scouting jobs for multiple athletes simultaneously |

---

## Problems & Pain Points

**Core problem:** Competitive BJJ athletes have footage but no structured way to turn it into actionable insight. They watch videos but don't know what patterns to look for, what to drill, or how to prepare for a specific opponent.

**Why current alternatives fall short:**
- **Manual note-taking**: Time-consuming, no timestamps, no pattern detection across multiple matches — takes 30–60 minutes per match
- **Dartfish / sports analysis tools**: Expensive (€hundreds/month), built for team sports with a dedicated analyst, steep learning curve, not BJJ-specific
- **Asking a coach**: Most competitors at this level don't have a dedicated coach — or the coach doesn't have time to watch all the footage
- **BJJFanatics / instructionals**: Technique content, not personal analysis — can't tell you what YOUR patterns are

**What it costs them:**
- Time: 1–3 hours of manual work per match to get any useful data
- Competitive disadvantage: opponents who have access to coaching staff or video analysis have a real edge
- Missed development: without pattern data, training is generic not targeted

**Emotional tension:**
- "I'm losing to the same things repeatedly but I can't see why"
- "I'm heading into a tournament and I have no idea what my opponent does"
- "I'm putting in the mat time but not improving as fast as I should be"
- "I can't afford a full-time coach but I want to compete at that level"

---

## Competitive Landscape

| Competitor | Type | How they fall short for our users |
|-----------|------|-----------------------------------|
| **Dartfish** | Direct (video analysis software) | €300+/month, built for team sports with analysts, huge learning curve, no AI automation — too expensive and complex for an individual competitor |
| **Hudl** | Direct (sports video analysis) | Team sport focus, no BJJ-specific position taxonomy, no auto-analysis — requires manual tagging |
| **Manual YouTube + notes** | Indirect (status quo) | No structure, no timestamps, no pattern detection, 30–60min per match |
| **BJJFanatics / instructionals** | Indirect (technique content) | General technique education, not personalised analysis of your own game |
| **Smoothcomp** | Secondary (tournament management) | RollPlan integrates WITH Smoothcomp — not a competitor. Smoothcomp manages brackets; RollPlan analyses the footage |
| **ChatGPT / general AI** | Indirect | Can't process video, no BJJ position taxonomy, no match data storage or pattern tracking |

**Our gap no competitor fills:** Fully automated, AI-powered match analysis specifically designed for the BJJ position taxonomy — working alone on your phone, affordable at freemium, no tagging required.

---

## Differentiation

**Key differentiators:**
1. **Zero manual tagging** — paste a URL or upload a file, AI does the entire breakdown automatically. No other tool does this for BJJ.
2. **BJJ-specific position taxonomy** — 25 position types (closed guard, half guard, back control, mount, etc.) recognised natively. Not a generic "zone" system.
3. **Opponent scouting pipeline** — paste footage URL → AI scans for that athlete → full gameplan generated. Smoothcomp/AJP/IBJJF bracket import automates this at scale.
4. **Long-stream scanning** — paste a multi-hour tournament stream or full mat-recording, name the athlete, and Gemini scans the whole thing to find and clip out every one of their matches. No manual scrubbing through hours of footage.
5. **Match Day screen** — single-glance briefing designed to be readable under pressure, one-handed, in a sports hall. No other tool has this.
6. **Fight Card** — a shareable head-to-head page for any matchup: stats, game styles, dominant positions, top attacks, and the condensed gameplan, ready to send to a coach or teammate before competing.
7. **Frame by Frame AI chat** — pause video at any moment, ask the AI "why did I lose the underhook here?" — it sees the same frame and responds in context.

**Why that's better:**
- Saves 1–3 hours of manual work per match
- Surfaces patterns that are invisible to human review (e.g. always starting in a defensive half guard vs left-side opponents)
- Scales scouting to cover an entire tournament draw in minutes, not days

**Why customers choose us:**
- The only tool that does this automatically for BJJ specifically
- Price: free to start, no credit card, no commitment
- Speed: analysis in 1–3 minutes vs hours of manual work

---

## Objections

| Objection | Response |
|-----------|----------|
| "The AI won't understand BJJ positions accurately" | The model is trained on a BJJ-specific 25-position taxonomy and key event types. Confidence scores are shown for every detection. Users can correct any wrong label inline — and that feedback improves future analyses. |
| "I don't have competition footage" | You can submit any YouTube URL — your own matches, opponent footage from public tournament streams. Smoothcomp brackets auto-discover footage for imported opponents. |
| "I'm not technical enough" | No coding, no tagging, no setup. Upload a video, wait 2 minutes, read the breakdown. The FAQ covers every feature in plain language. |
| "It's expensive" | The free tier gives 10 full analyses per month — enough for most competitors to track every match in a season. Paid tier is for high-volume users. |

**Anti-persona (NOT a good fit):**
- Recreational practitioners who never compete
- Coaches managing large teams with 50+ athletes (not yet — single-user product)
- Athletes in sports other than BJJ / submission grappling (no other sport's position taxonomy is supported)

---

## Switching Dynamics

**Push (away from current approach):**
- "Rewatching videos without a framework is a waste of time — I watch the same mistakes and still don't know how to fix them"
- "I spent 3 hours prepping for a tournament opponent and still had no game plan"

**Pull (toward RollPlan):**
- Automated analysis in 2 minutes
- Gameplan generated from opponent footage, with a win probability attached
- Match Day screen as a pre-match ritual
- Fight Card to share with coach/squad before competing

**Habit (keeping them stuck):**
- "I've always just watched footage manually" — familiarity, no cost, no tool change required
- WhatsApp/Discord groups sharing footage links informally

**Anxiety (about switching):**
- "What if the AI gets positions wrong?" → inline correction tools + confidence scores address this
- "Is my footage private?" → uploaded files stay private, YouTube URLs are not re-hosted
- "Beta = unreliable?" → re-scan button, correction tools, and active development reassure

---

## Customer Language

**How they describe the problem (verbatim from FAQ/feedback):**
- "I can see what happened but I don't know what to drill"
- "I'm heading into the tournament blind"
- "I watch the footage but I don't know what patterns I have"
- "I spent hours scouting and still wasn't ready"

**How they describe RollPlan:**
- "Match analysis tool"
- "Competition prep app"
- "AI scouting tool for BJJ"
- "Video breakdown tool"

**Words to USE:**
- analyse / analysis (not "score" or "grade")
- breakdown, footage, match, competition, opponent, gameplan
- positions, transitions, submissions, guard passes, sweeps, takedowns
- patterns, tendencies, vulnerabilities
- preparation, drill targets, coaching notes
- gi, no-gi, IBJJF, AJP, ADCC, EBI, Smoothcomp
- bracket import, win probability, Fight Card, Match Day, stream scan

**Words to AVOID:**
- "stats" (too generic — use "analysis" or "breakdown")
- "performance metrics" (too corporate)
- "dashboard" (suggests data overload — use "your player card" or "match overview")
- "machine learning model" (say "AI" or "Gemini AI")
- "data-driven" (overused)

**Glossary:**

| Term | Meaning in RollPlan |
|------|---------------------|
| Match analysis | Full AI breakdown of a video — positions, events, coaching notes |
| Player card | Athlete's profile page showing patterns across all analysed matches |
| Gameplan | AI-generated pre-match strategy based on opponent scouting + own match history, includes a win probability (Favourable/Even/Tough) |
| Match Day | Single-screen briefing for the morning of a tournament — one card per opponent with win probability, open-with, and watch-out |
| Fight Card | Shareable head-to-head page for a matchup — stats, game styles, dominant positions, attacks, and condensed gameplan |
| Frame by Frame | AI video chat — pause anywhere and ask questions in context |
| Scouting | Analysing opponent footage to prepare a gameplan — via bracket import (AJP/IBJJF/Smoothcomp) or pasted footage URLs |
| Stream scan | Pointing the AI at a long tournament stream or full mat-recording + an athlete name; it finds and clips out every match for that athlete |
| Position segment | A continuous period in one BJJ position (e.g. "in closed guard for 42 seconds") |
| Source quality | AI confidence rating for a technique extraction: high / medium / low |

---

## Brand Voice

**Tone:** Direct, honest, confident — like a knowledgeable training partner, not a corporate product
**Style:** Conversational but precise. Technical enough to be credible to competitors, plain enough for a purple belt to understand instantly.
**Personality adjectives:** Sharp, no-bullshit, athlete-first, practical, ambitious

**Voice DO's:**
- Lead with the outcome ("Full match breakdown in 2 minutes")
- Use competition language naturally (gi, no-gi, positions by name)
- Be honest about beta status — don't oversell
- Short sentences. One idea per sentence.
- Speak to the competitor's specific mental state (prep mode vs match day vs debrief)

**Voice DON'T's:**
- Don't use "journey", "empower", "unlock your potential" — generic and hollow
- Don't use passive voice
- Don't explain what BJJ is — the user already knows
- Don't say "our AI" every sentence — it becomes noise
- Don't hedge with "may" and "might" when you can be direct

---

## Style Guide

**Capitalisation:**
- Product name: RollPlan (capital R and P, always one word)
- Features: Match Analysis, Frame by Frame, Competition Day, Player Card, Gameplan (capitalised when referring to the app feature)
- Positions: closed guard, half guard, mount, back control (lowercase)
- Events: IBJJF, AJP, ADCC, EBI (all caps, as standard in the community)

**Formatting:**
- Use em-dashes (—) not hyphens for parenthetical asides
- Numbers: write out one through nine; use digits for 10+
- Time: "2–4 minutes" not "2-4 minutes" (en-dash for ranges)

**Email/contact:**
- support@rollplan.app (general support)
- feedback@rollplan.app (bug reports and feedback)

---

## Proof Points

**Current metrics (beta):**
- Analysis time: 1–3 minutes for a standard match (up to 15 min footage)
- Position taxonomy: 25 BJJ-specific position types
- Zero manual tagging required
- Free tier: 10 full analyses/month

**Value themes:**

| Theme | Proof |
|-------|-------|
| Speed | 1–3 min vs 30–60 min manual — 10–30x faster |
| Specificity | 25-position BJJ taxonomy, not generic zones |
| Automation | Full scouting pipeline: bracket import → footage scan → gameplan, zero manual steps |
| Accessibility | Free to start, no setup, works in any browser |

---

## Content & SEO Context

**Target keyword clusters:**

| Cluster | Primary Keyword | Secondary | Intent |
|---------|----------------|-----------|--------|
| Match analysis | "BJJ match analysis" | "jiu jitsu video analysis", "BJJ footage breakdown" | Commercial |
| Opponent scouting | "BJJ opponent scouting" | "how to scout BJJ competitors", "jiu jitsu competition prep" | Informational/Commercial |
| Competition prep | "BJJ competition preparation" | "how to prepare for BJJ tournament", "IBJJF preparation" | Informational |
| Gameplan | "BJJ gameplan" | "jiu jitsu game plan template", "competition gameplan BJJ" | Informational |
| AI sports | "AI sports analysis" | "AI video analysis BJJ" | Commercial |

**Key pages:**
- `/` — Home / landing page
- `/faq` — FAQ (rich product content)
- `/sign-up` — Primary conversion action
- `/player-card` — Post-auth home (authenticated users)

**Primary conversion action:** Sign up (free) → upload first match → get analysis

---

## Goals

**Business goal:** Reach paying users — validate freemium-to-paid conversion before scaling acquisition
**Key conversion action:** Sign up + analyse first match (activation)
**Secondary conversion:** Free → paid upgrade when hitting 10 analysis limit
**Current stage:** Beta, first users in Finland (Tommi Lundell, others), organic only
**Planned channels:** Organic social (BJJ community), SEO, BJJ influencer partnerships, word of mouth from competitors
