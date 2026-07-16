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
app.use(express.json())

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

// Error handler
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 RECIPhub API running on http://localhost:${PORT}`)
  console.log(`📝 API documentation: http://localhost:${PORT}/docs (coming soon)`)
})
