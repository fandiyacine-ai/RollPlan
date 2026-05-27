import { Inngest } from 'inngest'

export const inngest = new Inngest({ 
  id: 'rollplan',
  signingKey: process.env.INNGEST_SIGNING_KEY,
})

