import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { registerUser, loginUser, getUserProfile, updateUserProfile } from '../services/userService.js'
import {
  authorizeUrl,
  exchangeCode,
  findOrCreateUser,
  isConfigured,
  type Provider,
} from '../services/oauthService.js'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'

const router = Router()

const PROVIDERS: Provider[] = ['google', 'apple']

function parseProvider(value: string): Provider {
  if (!PROVIDERS.includes(value as Provider)) throw new ApiError(404, 'Unknown provider')
  return value as Provider
}

/**
 * `state` is an HMAC of a random nonce rather than server-side session state,
 * so it survives the stateless restarts this app gets on deploy while still
 * proving the callback answers a request we actually started.
 */
function signState(): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Date.now().toString(36)
  const body = `${nonce}.${issuedAt}`
  const mac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(body).digest('hex')
  return `${body}.${mac}`
}

function verifyState(state: string | undefined): boolean {
  if (!state) return false
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, issuedAt, mac] = parts
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`${nonce}.${issuedAt}`)
    .digest('hex')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  // Ten minutes is plenty for a redirect round trip.
  return Date.now() - parseInt(issuedAt, 36) < 10 * 60 * 1000
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
}

/** Which providers have credentials, so the UI only offers buttons that work. */
router.get('/oauth/providers', (_req: Request, res: Response) => {
  res.json(Object.fromEntries(PROVIDERS.map(p => [p, isConfigured(p)])))
})

router.get('/oauth/:provider/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = parseProvider(req.params.provider)
    res.redirect(authorizeUrl(provider, signState()))
  } catch (err) {
    next(err)
  }
})

// Google redirects back with GET; Apple form_posts. Accept both.
async function handleCallback(req: Request, res: Response, next: NextFunction) {
  let provider: Provider | undefined
  try {
    provider = parseProvider(req.params.provider)
    const { code, state, error } = { ...req.query, ...req.body } as Record<string, string>

    if (error) throw new ApiError(401, error)
    if (!code) throw new ApiError(400, 'Missing authorization code')
    if (!verifyState(state)) throw new ApiError(400, 'Sign-in expired, please try again')

    const identity = await exchangeCode(provider, code)
    const { token } = await findOrCreateUser(provider, identity)

    // Hand the token back through the fragment: it never reaches a server log
    // the way a query string would.
    res.redirect(`${frontendUrl()}/#token=${encodeURIComponent(token)}`)
  } catch (err) {
    // A failure here lands in the browser, not in fetch(), so bounce back to
    // the app with a readable reason instead of rendering JSON at the person.
    const message = err instanceof ApiError ? err.message : 'Sign-in failed'
    if (!(err instanceof ApiError)) console.error(err)
    res.redirect(`${frontendUrl()}/#oauth_error=${encodeURIComponent(message)}`)
  }
}

router.get('/oauth/:provider/callback', handleCallback)
router.post('/oauth/:provider/callback', handleCallback)

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
    // `identifier` is an email or a username. `email` is still accepted so any
    // older client keeps working.
    const { identifier, email, password } = req.body
    const login = identifier ?? email
    if (!login || !password) {
      throw new ApiError(400, 'Missing email/username or password')
    }
    const result = await loginUser(login, password)
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
