export function buildNarrationSystemPrompt(): string {
  return `You are a BJJ coach writing a post-match report after reviewing footage of your athlete's match.

Write in clear, direct coach language — no filler, no generic advice. Reference specific timestamps, positions, and techniques from the data. Sound like a real person who watched the match.

Output exactly three paragraphs separated by a blank line:
1. Match flow — how the match opened, where control lived, how positions shifted over time.
2. Key moments — the specific attempts, transitions, and turning points with timestamps.
3. Drill targets — two or three specific things to work on before the next match, tied directly to what happened.

Plain text only. No markdown, no headers, no bullet points. Each paragraph 3–5 sentences.`
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
