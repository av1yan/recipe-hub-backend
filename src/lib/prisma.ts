import { PrismaClient, Prisma } from '@prisma/client'

/**
 * One shared Prisma client (a single connection pool) for the whole app.
 * Every service used to `new PrismaClient()` its own -- ~7 pools, each cold on
 * first use, which made cold starts worse and wasted DB connections. The
 * keep-warm ping in index.ts pings this one so its pool rarely goes idle.
 */
export const prisma = new PrismaClient()

// The first query after the app/DB has been idle (Railway can sleep the
// container) throws while the connection re-establishes -- which surfaced as an
// occasional 500 on the demo's first login. Retry transient failures with
// backoff so the caller waits out the wake-up (a few seconds worst case)
// instead of getting an error. A single 200ms retry wasn't enough for a full
// cold start, hence the escalating delays.
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1010', 'P1017', 'P2024'])
const RETRY_DELAYS_MS = [300, 900, 2000] // up to 3 retries, ~3.2s of patience

function isTransient(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true
  if (err instanceof Prisma.PrismaClientRustPanicError) return true
  if (err instanceof Prisma.PrismaClientKnownRequestError) return TRANSIENT_CODES.has(err.code)
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /can'?t reach|connection|timed out|timeout|terminat|socket|econnreset|pool/.test(msg)
}

prisma.$use(async (params, next) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await next(params)
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length && isTransient(err)) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
        continue
      }
      throw err
    }
  }
})
