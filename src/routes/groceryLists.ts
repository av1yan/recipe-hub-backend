import { Router, Request, Response, NextFunction } from 'express'
import {
  createGroceryList,
  getGroceryList,
  listGroceryLists,
  addItemToGroceryList,
  updateGroceryItem,
  removeGroceryItem,
} from '../services/groceryService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body
    const list = await createGroceryList(req.user!.userId, name)
    res.json(list)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await getGroceryList(req.user!.userId, req.params.id)
    if (!list) {
      throw new ApiError(404, 'Grocery list not found')
    }
    res.json(list)
  } catch (err) {
    next(err)
  }
})

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lists = await listGroceryLists(req.user!.userId)
    res.json(lists)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/items', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await addItemToGroceryList(req.user!.userId, req.params.id, req.body)
    res.json(item)
  } catch (err) {
    next(err)
  }
})

router.put('/items/:itemId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checked } = req.body
    const item = await updateGroceryItem(req.user!.userId, req.params.itemId, checked)
    res.json(item)
  } catch (err) {
    next(err)
  }
})

router.delete('/items/:itemId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeGroceryItem(req.user!.userId, req.params.itemId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
