export type ScAthleteRef = {
  name: string
  smoothcompAthleteId: string
  profileUrl: string
}

export type ScBracketMatch = {
  athlete1: ScAthleteRef | null
  athlete2: ScAthleteRef | null
  winnerAthleteId: string | null
  method: string | null     // 'submission' | 'points' | 'dq' | 'walkover' | null
  technique: string | null
}

export type ScBracketResult = {
  eventId: string
  bracketId: string
  divisionName: string
  athletes: ScAthleteRef[]
  matches: ScBracketMatch[]
  bracketIsPublished: boolean
}

export type ScPastCompetition = {
  eventName: string
  eventId: string
  eventUrl: string
  date: string | null
  placement: string | null   // '1st', '2nd', etc.
  youtubeUrl: string | null  // from the event's streams tab, if found
}

export type ScAthleteProfile = {
  athleteId: string
  name: string
  isPublic: boolean
  pastCompetitions: ScPastCompetition[]
  photoUrl: string | null
}

export type ScEventStream = {
  label: string       // e.g. "Mat 1", "Day 2 – Mat 3"
  youtubeUrl: string
}

export type ScEventStreams = {
  eventId: string
  streams: ScEventStream[]
}
