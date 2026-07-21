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
import { importFromUrl, importFromText, fetchSocialCaption } from '../services/importService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

// Imports return a draft for review; they never save anything on their own.
// Both sit above /:id so those words aren't read as recipe ids.
router.post('/import/url', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body
    if (!url) throw new ApiError(400, 'Paste a link to import')
    res.json(await importFromUrl(String(url)))
  } catch (err) {
    next(err)
  }
})

router.post('/import/social', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body
    if (!url) throw new ApiError(400, 'Paste a link to import')
    // Returns the caption to lay out, not a recipe -- see fetchSocialCaption.
    res.json(await fetchSocialCaption(String(url)))
  } catch (err) {
    next(err)
  }
})

router.post('/import/text', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body
    if (!text) throw new ApiError(400, 'Paste the recipe text to import')
    res.json(importFromText(String(text)))
  } catch (err) {
    next(err)
  }
})

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Keep empty/stub recipes out: need a name and at least one real ingredient
    // or step. Guards every path (manual, import, pantry save/plan).
    const { name, ingredients, instructions } = req.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Give the recipe a name')
    }
    const hasIngredient = Array.isArray(ingredients) && ingredients.some((i: any) => i && String(i.name || '').trim())
    const hasStep = Array.isArray(instructions) && instructions.some((s: any) => s && String(s.text || '').trim())
    if (!hasIngredient && !hasStep) {
      throw new ApiError(400, 'Add at least one ingredient or step')
    }
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
