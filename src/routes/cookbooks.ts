import { Router, Request, Response, NextFunction } from 'express'
import {
  createCookbook,
  getCookbook,
  listCookbooks,
  addRecipeToCookbook,
  removeRecipeFromCookbook,
  deleteCookbook,
} from '../services/cookbookService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body
    const cookbook = await createCookbook(req.user!.userId, name, description)
    res.json(cookbook)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookbook = await getCookbook(req.user!.userId, req.params.id)
    if (!cookbook) {
      throw new ApiError(404, 'Cookbook not found')
    }
    res.json(cookbook)
  } catch (err) {
    next(err)
  }
})

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookbooks = await listCookbooks(req.user!.userId)
    res.json(cookbooks)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteCookbook(req.user!.userId, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/recipes', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipeId } = req.body
    const result = await addRecipeToCookbook(req.user!.userId, req.params.id, recipeId)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/recipes/:recipeId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeRecipeFromCookbook(req.user!.userId, req.params.id, req.params.recipeId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
