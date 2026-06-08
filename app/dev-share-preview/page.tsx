'use client'

import { ShareCard } from '../(dashboard)/player-card/share-card'
import { ShareButton as FightCardShareButton } from '../(dashboard)/tournaments/[id]/fight-card/[opponentId]/share-card'

export default function DevSharePreview() {
  return (
    <div style={{ display: 'flex', gap: 40, padding: 40, background: '#f4f4f5', flexWrap: 'wrap' }}>
      <ShareCard
        data={{
          name: 'Yacine Fandi',
          belt: 'purple',
          gym: 'Helsinki BJJ',
          controlPct: 64,
          underPressurePct: 22,
          matchCount: 7,
          totalMatSeconds: 5400,
          strongPositions: [
            { name: 'Closed guard', dominantPct: 0.7 },
            { name: 'Side control', dominantPct: 0.55 },
            { name: 'Mount', dominantPct: 0.4 },
          ],
          exposedPositions: [
            { name: 'Half guard bottom', inferiorPct: 0.6 },
            { name: 'Turtle', inferiorPct: 0.45 },
          ],
        }}
      />
      <FightCardShareButton
        data={{
          userName: 'Yacine Fandi',
          opponentName: 'Nihate Pahati',
          tournamentName: 'AJP Tour Finland National Jiu-Jitsu Championship 2026',
          eventDate: '2026-09-13',
          ruleset: 'AJP',
          division: 'Purple Belt',
          weightClass: '-85kg',
          ownAjpRecord: '3W 2L',
          oppAjpRecord: '12W 4L',
          oppIbjjfBest: 'Gold — Europeans 2026',
        }}
      />
    </div>
  )
}
