import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { errorHandler } from './middleware/errorHandler.js'
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

app.listen(PORT, () => {
  console.log(`🚀 recipHub API running on http://localhost:${PORT}`)
  console.log(`📝 API documentation: http://localhost:${PORT}/docs (coming soon)`)
})
