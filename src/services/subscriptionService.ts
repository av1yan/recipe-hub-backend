// Subscription entitlement, kept server-authoritative.
//
// RevenueCat already validates the App Store receipt on its servers; we read
// that verdict with our *secret* key and mirror it onto the User row. The client
// never asserts its own Pro status to the API -- it only asks us to re-check.
//
// The RevenueCat app_user_id we query is the user's own id: the client calls
// Purchases.logIn(user.id) before buying, so a subscriber is keyed by the same
// id here. See docs/revenuecat-setup.md.

import { prisma } from '../lib/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

// The entitlement identifier configured in the RevenueCat dashboard.
const ENTITLEMENT = 'pro'

export interface ProState {
  isPro: boolean
  proExpiresAt: Date | null
  proSource: string | null
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_SECRET_KEY)
}

const EMPTY: ProState = { isPro: false, proExpiresAt: null, proSource: null }

/** Writes the resolved state onto the user, but only when something changed. */
async function persist(userId: string, next: ProState, current: ProState | null): Promise<ProState> {
  if (
    current &&
    current.isPro === next.isPro &&
    current.proSource === next.proSource &&
    (current.proExpiresAt?.getTime() ?? null) === (next.proExpiresAt?.getTime() ?? null)
  ) {
    return next
  }
  await prisma.user.update({
    where: { id: userId },
    data: { isPro: next.isPro, proExpiresAt: next.proExpiresAt, proSource: next.proSource },
  })
  return next
}

/**
 * Re-checks a user's subscription against RevenueCat and mirrors the result.
 *
 * - A `complimentary` grant is ours, not RevenueCat's, so a RevenueCat miss must
 *   never revoke it.
 * - With RevenueCat unconfigured (local/dev, or before the keys are set) this is
 *   a no-op that returns whatever is stored, so the endpoint stays safe to call.
 */
export async function refreshSubscription(userId: string): Promise<ProState> {
  const stored = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPro: true, proExpiresAt: true, proSource: true },
  })
  if (!stored) throw new ApiError(404, 'User not found')

  if (stored.proSource === 'complimentary') return stored
  if (!isRevenueCatConfigured()) return stored

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` },
  })

  // 404 = RevenueCat has never seen this id (no purchase yet). That's a valid
  // "not Pro", not an error.
  if (res.status === 404) return persist(userId, EMPTY, stored)
  if (!res.ok) throw new ApiError(502, 'Could not reach the subscription service')

  const body = (await res.json().catch(() => ({}))) as any
  const ent = body?.subscriber?.entitlements?.[ENTITLEMENT]
  // `expires_date` is an ISO string, or null for a non-expiring (lifetime) grant.
  const expiresRaw: string | null | undefined = ent?.expires_date
  const active = Boolean(ent) && (expiresRaw == null || new Date(expiresRaw).getTime() > Date.now())

  const next: ProState = active
    ? { isPro: true, proExpiresAt: expiresRaw ? new Date(expiresRaw) : null, proSource: 'app_store' }
    : EMPTY

  return persist(userId, next, stored)
}
