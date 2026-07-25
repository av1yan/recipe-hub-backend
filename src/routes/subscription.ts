import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'
import { refreshSubscription, isRevenueCatConfigured } from '../services/subscriptionService.js'

const router = Router()

/**
 * Re-check the caller's subscription against RevenueCat and return the result.
 * The app calls this after a purchase or restore, and on launch, then trusts the
 * server's answer rather than its own StoreKit view.
 */
router.post('/refresh', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await refreshSubscription(req.user!.userId)
    res.json({ isPro: state.isPro, proExpiresAt: state.proExpiresAt })
  } catch (err) {
    next(err)
  }
})

/**
 * RevenueCat server-to-server webhook: keeps entitlement current for events that
 * happen while the app is closed (renewals, cancellations, expirations, refunds).
 * RevenueCat sends a shared `Authorization` header we set on the dashboard; we
 * re-pull the authoritative state rather than trusting the event body.
 */
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      throw new ApiError(401, 'Unauthorized')
    }
    const appUserId = req.body?.event?.app_user_id
    // Don't let a downstream hiccup make RevenueCat retry forever; ack regardless.
    if (appUserId) await refreshSubscription(String(appUserId)).catch(() => {})
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Whether the store integration is live, so the client can degrade gracefully. */
router.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: isRevenueCatConfigured() })
})

export default router
