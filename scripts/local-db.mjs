// Runs a local Postgres for development.
//
// The schema is postgres-only, so there is no SQLite shortcut for local work.
// embedded-postgres unpacks real PostgreSQL binaries under node_modules and
// runs them as a normal user process -- no system install, no sudo, no Docker.
//
// Usage: npm run db:local   (leave it running, then `npm run dev` alongside)

import EmbeddedPostgres from 'embedded-postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PORT = Number(process.env.LOCAL_DB_PORT || 5433)
const DB_NAME = process.env.LOCAL_DB_NAME || 'recipihub'
const USER = 'postgres'
const PASSWORD = 'postgres'

const pg = new EmbeddedPostgres({
  databaseDir: join(ROOT, '.pgdata'),
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
})

// initialise() throws if the cluster already exists, which is the normal case
// on every run after the first.
try {
  await pg.initialise()
  console.log('📦 created a new Postgres cluster in .pgdata')
} catch {
  console.log('📦 reusing the existing Postgres cluster in .pgdata')
}

await pg.start()

try {
  await pg.createDatabase(DB_NAME)
  console.log(`🗄️  created database "${DB_NAME}"`)
} catch {
  // Already there.
}

const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`
console.log(`\n🐘 Postgres listening on ${PORT}`)
console.log(`   DATABASE_URL="${url}"\n`)
console.log('   Leave this running. In another terminal:')
console.log('     npm run db:push   # create the tables')
console.log('     npm run db:seed   # add the demo user')
console.log('     npm run dev       # start the API\n')
console.log('   Ctrl+C to stop.')

let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  console.log('\n👋 stopping Postgres...')
  try {
    await pg.stop()
  } catch (err) {
    console.error('failed to stop cleanly:', err)
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
