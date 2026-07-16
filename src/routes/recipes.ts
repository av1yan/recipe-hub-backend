import { Router, Request, Response, NextFunction } from 'express'
import {
  createRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
  deleteRecipe,
  saveRecipe,
  unsaveRecipe,
  getSavedRecipes,
} from '../services/recipeService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipe = await createRecipe(req.user!.userId, req.body)
    res.json(recipe)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipe = await getRecipe(req.params.id)
    if (!recipe) {
      throw new ApiError(404, 'Recipe not found')
    }
    res.json(recipe)
  } catch (err) {
    next(err)
  }
})

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipes = await listRecipes(req.user!.userId, req.query)
    res.json(recipes)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipe = await updateRecipe(req.user!.userId, req.params.id, req.body)
    res.json(recipe)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteRecipe(req.user!.userId, req.params.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/save', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await saveRecipe(req.user!.userId, req.params.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/save', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await unsaveRecipe(req.user!.userId, req.params.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.get('/saved/all', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saved = await getSavedRecipes(req.user!.userId)
    res.json(saved)
  } catch (err) {
    next(err)
  }
})

export default router
