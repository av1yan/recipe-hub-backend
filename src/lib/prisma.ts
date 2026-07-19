import { PrismaClient, Prisma } from '@prisma/client'

/**
 * One shared Prisma client (a single connection pool) for the whole app.
 * Every service used to `new PrismaClient()` its own -- ~7 pools, each cold on
 * first use, which made cold starts worse and wasted DB connections. The
 * keep-warm ping in index.ts pings this one so its pool rarely goes idle.
 */
export const prisma = new PrismaClient()

// A dropped-but-not-yet-reaped idle connection (or a brief pool hiccup) throws
// on the first query after a quiet spell -- which surfaced as an occasional 500
// on the demo's first login. Retry those transient failures once; Prisma
// re-establishes the connection on the retry, so the caller gets a slightly
// slower response instead of an error.
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])
prisma.$use(async (params, next) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await next(params)
    } catch (err) {
      const transient =
        err instanceof Prisma.PrismaClientInitializationError ||
        (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(err.code))
      if (transient && attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 200))
        continue
      }
      throw err
    }
  }
})
