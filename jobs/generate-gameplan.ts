import { inngest } from '../lib/inngest'

export const generateGameplan = inngest.createFunction(
  {
    id: 'generate-gameplan',
    name: 'Generate Tournament Gameplan',
    triggers: [{ event: 'gameplan/requested' }],
  },
  async ({ event, step }: { event: { data: { tournamentId: string; opponentId: string } }; step: any }) => {
    const { tournamentId, opponentId } = event.data

    await step.run('fetch-player-cards', async () => {
      // TODO: pull user's player card + opponent player cards
      return {}
    })

    await step.run('synthesise-gameplan', async () => {
      // TODO: call Claude Sonnet with generate-gameplan prompt
      return {}
    })

    await step.run('store-gameplan', async () => {
      // TODO: write gameplans row with versioned structured_plan
      return {}
    })
  }
)
