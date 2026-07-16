import { Router, Request, Response, NextFunction } from 'express'
import {
  createMealPlan,
  getMealPlan,
  listMealPlans,
  addMealToMealPlan,
  removeMealFromMealPlan,
} from '../services/mealPlanService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { weekStart, name } = req.body
    const plan = await createMealPlan(req.user!.userId, new Date(weekStart), name)
    res.json(plan)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await getMealPlan(req.user!.userId, req.params.id)
    if (!plan) {
      throw new ApiError(404, 'Meal plan not found')
    }
    res.json(plan)
  } catch (err) {
    next(err)
  }
})

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await listMealPlans(req.user!.userId)
    res.json(plans)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/meals', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipeId, day, mealType } = req.body
    const meal = await addMealToMealPlan(req.user!.userId, req.params.id, recipeId, day, mealType)
    res.json(meal)
  } catch (err) {
    next(err)
  }
})

router.delete('/meals/:mealId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeMealFromMealPlan(req.user!.userId, req.params.mealId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
