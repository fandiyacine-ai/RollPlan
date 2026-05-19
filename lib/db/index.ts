import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

// Singleton: reuse one pool per process so dev hot-reloads don't leak connections.
// max:4 keeps total usage (4 × N railway replicas) well under PgBouncer's session pool of 15.
const g = globalThis as unknown as { _pgClient?: postgres.Sql }
const client = g._pgClient ?? postgres(connectionString, { prepare: false, max: 4 })
if (process.env.NODE_ENV !== 'production') g._pgClient = client

export const db = drizzle(client, { schema })
export type DB = typeof db
