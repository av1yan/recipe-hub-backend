import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { errorHandler } from './middleware/errorHandler.js'
import { prisma } from './lib/prisma.js'
import authRoutes from './routes/auth.js'
import recipeRoutes from './routes/recipes.js'
import mealPlanRoutes from './routes/mealPlans.js'
import groceryRoutes from './routes/groceryLists.js'
import cookbookRoutes from './routes/cookbooks.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
// Recipe photos are stored inline as compressed data URLs, which exceed the
// default 100kb body limit.
app.use(express.json({ limit: '6mb' }))
// Apple's sign-in callback arrives as a form POST rather than JSON.
app.use(express.urlencoded({ extended: false }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/recipes', recipeRoutes)
app.use('/api/meal-plans', mealPlanRoutes)
app.use('/api/grocery-lists', groceryRoutes)
app.use('/api/cookbooks', cookbookRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Database initialization (temporary - for setup only)
app.post('/api/init-db', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const bcryptjs = await import('bcryptjs')
    const prisma = new PrismaClient()

    try {
      // First, check if we can connect and if tables exist
      const existingUser = await prisma.user.findFirst()

      if (existingUser) {
        // Tables exist, check for demo user
        const demoUser = await prisma.user.findUnique({
          where: { email: 'demo@example.com' }
        })
        if (demoUser) {
          await prisma.$disconnect()
          return res.json({ status: 'already_initialized', user: 'demo@example.com' })
        }
      }
    } catch (e) {
      // Tables likely don't exist yet
      console.log('Tables may not exist yet, creating...')
    }

    // Try to create test user (if table exists)
    try {
      const hashedPassword = await bcryptjs.default.hash('Demo123456!', 10)
      const user = await prisma.user.create({
        data: {
          email: 'demo@example.com',
          name: 'Demo User',
          passwordHash: hashedPassword
        }
      })
      await prisma.$disconnect()
      return res.json({ status: 'initialized', user: user.email })
    } catch (createError) {
      await prisma.$disconnect()
      return res.status(500).json({
        error: 'Database schema not ready. Please run: npm run db:push',
        details: createError instanceof Error ? createError.message : 'Unknown error'
      })
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Database initialization failed' })
  }
})

// Error handler
app.use(errorHandler)

// Keep the shared DB connection pool warm. An idle Postgres connection can be
// dropped, and the first request after a quiet spell then cold-starts -- which
// surfaced as an occasional 500 on the first login. Ping on boot (also connects
// the pool eagerly) and every few minutes after. Override with KEEP_WARM_MS.
const KEEP_WARM_MS = Number(process.env.KEEP_WARM_MS) || 4 * 60 * 1000
async function keepWarm() {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    console.error('keep-warm ping failed:', err)
  }
}

app.listen(PORT, () => {
  console.log(`🚀 recipHub API running on http://localhost:${PORT}`)
  console.log(`📝 API documentation: http://localhost:${PORT}/docs (coming soon)`)
  keepWarm()
  setInterval(keepWarm, KEEP_WARM_MS)
})
