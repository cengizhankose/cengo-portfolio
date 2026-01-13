import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.PG_CONNECTION_URL

if (!connectionString) {
  throw new Error('PG_CONNECTION_URL environment variable is not set')
}

const client = postgres(connectionString)

export const db = drizzle(client, { schema })
