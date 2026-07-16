import { Router, Request, Response, NextFunction } from 'express'
import { registerUser, loginUser, getUserProfile, updateUserProfile } from '../services/userService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, password } = req.body
    if (!email || !name || !password) {
      throw new ApiError(400, 'Missing required fields')
    }
    const result = await registerUser(email, name, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      throw new ApiError(400, 'Missing email or password')
    }
    const result = await loginUser(email, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getUserProfile(req.user!.userId)
    res.json(user)
  } catch (err) {
    next(err)
  }
})

router.put('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, username } = req.body
    const user = await updateUserProfile(req.user!.userId, { name, username })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

export default router
