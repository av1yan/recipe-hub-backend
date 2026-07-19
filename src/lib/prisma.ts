import { PrismaClient } from '@prisma/client'

/**
 * One shared Prisma client (a single connection pool) for the whole app.
 * Every service used to `new PrismaClient()` its own -- ~7 pools, each cold on
 * first use, which made cold starts worse and wasted DB connections. The
 * keep-warm ping in index.ts pings this one so its pool never goes idle.
 */
export const prisma = new PrismaClient()
