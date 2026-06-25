import { db } from '../lib/db'
import { users, notifications } from '../lib/db/schema'
import { ilike } from 'drizzle-orm'

// One-off: in-app notification (no email) announcing the outage resolution.
// Usage:
//   DATABASE_URL=... npx tsx scripts/send-outage-notification.ts mikko     # users whose email contains "mikko"
//   DATABASE_URL=... npx tsx scripts/send-outage-notification.ts --all    # every user

const TITLE = 'Service disruption resolved'
const BODY = 'We experienced an outage in RollPlan earlier today. This has been fixed and all pending activities have now been processed. Thanks for your patience!'

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: npx tsx scripts/send-outage-notification.ts <email-substring | --all>')
    process.exit(1)
  }

  const recipients = arg === '--all'
    ? await db.select({ id: users.id, email: users.email }).from(users)
    : await db.select({ id: users.id, email: users.email }).from(users).where(ilike(users.email, `%${arg}%`))

  if (recipients.length === 0) {
    console.error(`No users matched "${arg}" — nothing sent.`)
    process.exit(1)
  }

  console.log(`Sending to ${recipients.length} user(s):`)
  for (const u of recipients) console.log(`  - ${u.email}`)

  await db.insert(notifications).values(
    recipients.map(u => ({
      userId: u.id,
      type: 'system',
      title: TITLE,
      body: BODY,
    }))
  )

  console.log('Done — in-app notifications created.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
