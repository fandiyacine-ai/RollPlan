export const GENERATE_PREDICTION_PROMPT_VERSION = 'v1'

export function buildPredictionSystemPrompt(): string {
  return `You are an elite BJJ analyst generating a data-driven matchup prediction.

You receive structured match data for two athletes. Your task is to estimate the win probability and explain your reasoning.

## Rules
- Base every claim on the data provided. Do NOT use generic BJJ reasoning.
- win_probability: 0–100. Do NOT always return 50 — make a genuine estimate from the evidence.
- If the coached athlete has < 3 own analysed matches, set confidence to "low" and reflect uncertainty in the probability.
- If the opponent has < 2 scouted matches, note this in rationale and temper the estimate.
- key_advantages and key_risks must reference SPECIFIC patterns observed in the data (positions, submission rates, tendencies).
- Do NOT include raw UUIDs or database IDs in any output field.
- verdict must follow from win_probability: favourable > 60, neutral 40–60, tough < 40.`
}

export function buildPredictionUserPrompt(data: {
  tournament: { name: string; ruleset: string; division?: string | null }
  opponent: { name: string; notes?: string | null }
  yourStats: {
    matchCount: number
    topPositionSeconds: number
    bottomPositionSeconds: number
    submissionWins: number
    submissionLosses: number
    dominantPositions: string[]   // top 3 positions by time
    commonSubmissions: string[]   // submissions attempted / landed
    controlRate: number           // 0–1
    winRate: number               // 0–1 from analysed matches with results
  }
  opponentStats: {
    matchCount: number
    topPositionSeconds: number
    bottomPositionSeconds: number
    submissionWins: number
    submissionLosses: number
    dominantPositions: string[]
    commonSubmissions: string[]
    controlRate: number
    winRate: number
  }
}): string {
  const { tournament, opponent, yourStats, opponentStats } = data

  return `## Tournament
${tournament.name} | ${tournament.ruleset.toUpperCase()}${tournament.division ? ` | ${tournament.division}` : ''}

## Matchup: You vs ${opponent.name}
${opponent.notes ? `Opponent notes: ${opponent.notes}` : ''}

## Your Profile (${yourStats.matchCount} analysed matches)
- Win rate: ${Math.round(yourStats.winRate * 100)}%
- Control rate: ${Math.round(yourStats.controlRate * 100)}% (dominant position time)
- Time on top: ${Math.round(yourStats.topPositionSeconds)}s | Time on bottom: ${Math.round(yourStats.bottomPositionSeconds)}s
- Submission wins: ${yourStats.submissionWins} | Submission losses: ${yourStats.submissionLosses}
- Dominant positions: ${yourStats.dominantPositions.join(', ') || 'insufficient data'}
- Common submissions: ${yourStats.commonSubmissions.join(', ') || 'none recorded'}

## ${opponent.name} Scouted Profile (${opponentStats.matchCount} scouted matches)
- Win rate in footage: ${Math.round(opponentStats.winRate * 100)}%
- Control rate: ${Math.round(opponentStats.controlRate * 100)}%
- Time on top: ${Math.round(opponentStats.topPositionSeconds)}s | Time on bottom: ${Math.round(opponentStats.bottomPositionSeconds)}s
- Submission wins: ${opponentStats.submissionWins} | Submission losses: ${opponentStats.submissionLosses}
- Dominant positions: ${opponentStats.dominantPositions.join(', ') || 'insufficient data'}
- Common submissions: ${opponentStats.commonSubmissions.join(', ') || 'none recorded'}

Generate the matchup prediction.`
}
