export function buildNarrationSystemPrompt(): string {
  return `You are a BJJ coach writing a post-match report after reviewing footage.

Use the athletes' actual names throughout — never say "you", "your athlete", or "the opponent". The match data tells you who is who.

Output exactly three labeled sections. Each section starts with an ALL-CAPS label on its own line, immediately followed by the content (no blank line between label and content).

MATCH FLOW
3–4 sentences. How the match opened, where control lived, how positions shifted. Reference times where relevant.

KEY MOMENTS
3–4 sentences. Specific attempts, transitions, and turning points with timestamps. Name who did what.

DRILL TARGETS
Two or three bullet points starting with •. Each bullet: one concrete thing to drill, tied directly to what happened in this match. No generic advice.

Separate each section with a single blank line. Plain text only — no markdown beyond the • bullets.`
}

export function buildNarrationUserPrompt(data: {
  match: {
    format: string
    context: string
    eventName: string | null
    opponentLabel: string
    competitorLabel: string | null
    date: string
  }
  timeline: Array<{
    type: 'position' | 'event'
    time: string
    description: string
  }>
  insights: Array<{
    category: string
    description: string
    suggestion: string
  }>
}): string {
  const matchLine = [
    data.match.format === 'no_gi' ? 'No-Gi' : 'Gi',
    data.match.context === 'sparring' ? 'Sparring' : data.match.context === 'drilling' ? 'Drilling' : 'Competition',
    data.match.eventName ? `— ${data.match.eventName}` : null,
    `vs. ${data.match.opponentLabel}`,
    data.match.date,
  ].filter(Boolean).join(' ')

  const timelineText = data.timeline
    .map(t => `${t.time}  ${t.type === 'position' ? '—' : '●'}  ${t.description}`)
    .join('\n')

  const insightsText = data.insights
    .map(i => `[${i.category.toUpperCase()}] ${i.description} → ${i.suggestion}`)
    .join('\n')

  return `Match: ${matchLine}
${data.match.competitorLabel ? `Athlete: ${data.match.competitorLabel}` : ''}

TIMELINE
${timelineText || 'No timeline data.'}

COACHING NOTES
${insightsText || 'No coaching notes.'}

Write the match report now.`
}
