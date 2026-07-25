import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { registerUser, loginUser, getUserProfile, updateUserProfile, deleteUser, changePassword } from '../services/userService.js'
import {
  authorizeUrl,
  exchangeCode,
  findOrCreateUser,
  isConfigured,
  verifyAppleIdentity,
  type Provider,
} from '../services/oauthService.js'
import { requestPasswordReset, resetPassword } from '../services/passwordResetService.js'
import { isEmailConfigured } from '../services/emailService.js'
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
type ReturnTo = 'web' | 'app'

function signState(returnTo: ReturnTo): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Date.now().toString(36)
  // returnTo rides in the signed state so the callback (a separate request that
  // only gets `state` back from the provider) knows whether to hand the token to
  // the web site or to the native app's deep link.
  const body = `${nonce}.${issuedAt}.${returnTo}`
  const mac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(body).digest('hex')
  return `${body}.${mac}`
}

function verifyState(state: string | undefined): { ok: boolean; returnTo: ReturnTo } {
  const fail = { ok: false, returnTo: 'web' as ReturnTo }
  if (!state) return fail
  const parts = state.split('.')
  if (parts.length !== 4) return fail
  const [nonce, issuedAt, returnTo, mac] = parts
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`${nonce}.${issuedAt}.${returnTo}`)
    .digest('hex')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail
  // Ten minutes is plenty for a redirect round trip.
  if (Date.now() - parseInt(issuedAt, 36) >= 10 * 60 * 1000) return fail
  return { ok: true, returnTo: returnTo === 'app' ? 'app' : 'web' }
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
}

/**
 * Where the signed-in token (or an error) is handed back through the URL
 * fragment. Native sign-in runs in the system browser (Google/Apple refuse an
 * embedded WebView) and returns via a custom-scheme deep link the app
 * intercepts; the web flow returns to the site as before.
 */
function returnUrl(returnTo: ReturnTo, fragment: string): string {
  if (returnTo === 'app') return `com.reciphub.app://oauth#${fragment}`
  return `${frontendUrl()}/#${fragment}`
}

/** Which providers have credentials, so the UI only offers buttons that work. */
router.get('/oauth/providers', (_req: Request, res: Response) => {
  res.json(Object.fromEntries(PROVIDERS.map(p => [p, isConfigured(p)])))
})

router.get('/oauth/:provider/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = parseProvider(req.params.provider)
    // A native app opens this in the system browser and wants the token back via
    // its deep link, not the web frontend.
    const returnTo: ReturnTo = req.query.return === 'app' ? 'app' : 'web'
    res.redirect(authorizeUrl(provider, signState(returnTo)))
  } catch (err) {
    next(err)
  }
})

// Google redirects back with GET; Apple form_posts. Accept both.
async function handleCallback(req: Request, res: Response, next: NextFunction) {
  // Parsed up front so a failure still bounces back to the right place.
  let returnTo: ReturnTo = 'web'
  try {
    const provider = parseProvider(req.params.provider)
    const { code, state, error } = { ...req.query, ...req.body } as Record<string, string>
    const verified = verifyState(state)
    returnTo = verified.returnTo

    if (error) throw new ApiError(401, error)
    if (!code) throw new ApiError(400, 'Missing authorization code')
    if (!verified.ok) throw new ApiError(400, 'Sign-in expired, please try again')

    const identity = await exchangeCode(provider, code)
    const { token } = await findOrCreateUser(provider, identity)

    // Hand the token back through the fragment: it never reaches a server log
    // the way a query string would.
    res.redirect(returnUrl(returnTo, `token=${encodeURIComponent(token)}`))
  } catch (err) {
    // A failure here lands in the browser, not in fetch(), so bounce back to
    // the app/site with a readable reason instead of rendering JSON at the person.
    const message = err instanceof ApiError ? err.message : 'Sign-in failed'
    if (!(err instanceof ApiError)) console.error(err)
    res.redirect(returnUrl(returnTo, `oauth_error=${encodeURIComponent(message)}`))
  }
}

router.get('/oauth/:provider/callback', handleCallback)
router.post('/oauth/:provider/callback', handleCallback)

/**
 * Native Sign in with Apple: the iOS app runs Apple's authorization sheet and
 * posts the resulting identity token here. We verify it and mint our own JWT,
 * returning the same `{ user, token }` shape as password login so the client
 * treats every sign-in path identically.
 */
router.post('/apple/native', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identityToken, name } = req.body || {}
    if (!identityToken) throw new ApiError(400, 'Missing identity token')
    const identity = await verifyAppleIdentity(String(identityToken), name ? String(name) : undefined)
    const { user, token } = await findOrCreateUser('apple', identity)
    res.json({ user, token })
  } catch (err) {
    next(err)
  }
})

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

// Whether reset links can actually be sent, so the UI need not offer a dead link.
router.get('/password-reset/available', (_req: Request, res: Response) => {
  res.json({ available: isEmailConfigured() })
})

router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requestPasswordReset(String(req.body?.email || ''))
    // Deliberately the same answer whether or not the account exists.
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body || {}
    await resetPassword(String(token || ''), String(password || ''))
    res.json({ ok: true })
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

router.post('/change-password', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword) throw new ApiError(400, 'Missing current or new password')
    await changePassword(req.user!.userId, String(currentPassword), String(newPassword))
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Permanent, server-side account deletion (App Store Guideline 5.1.1(v)).
router.delete('/account', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteUser(req.user!.userId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
