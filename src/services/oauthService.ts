// Google and Apple sign-in, using the OAuth 2.0 authorization-code flow.
//
// Both providers converge on the same shape: send the person to the provider,
// get a `code` back on our callback, trade it for an ID token, verify that
// token's signature against the provider's public keys, and trust the claims.
// The differences are per-provider config below.
//
// NOTE: this has been exercised against the providers' real discovery
// documents and URL contracts, but never against a live sign-in -- that needs
// credentials only the account owner can create. See docs/oauth-setup.md.

import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose'
import { PrismaClient } from '@prisma/client'
import { generateToken } from '../utils/jwt.js'
import { ApiError } from '../middleware/errorHandler.js'

const prisma = new PrismaClient()

export type Provider = 'google' | 'apple'

interface ProviderConfig {
  authUrl: string
  tokenUrl: string
  issuer: string | string[]
  jwks: string
  scope: string
  /** Apple returns the profile via POST, which needs form_post + a nonce-free flow. */
  responseMode?: string
  clientId(): string | undefined
  clientSecret(): Promise<string>
}

const CONFIG: Record<Provider, ProviderConfig> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: async () => process.env.GOOGLE_CLIENT_SECRET || '',
  },
  apple: {
    authUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    issuer: 'https://appleid.apple.com',
    jwks: 'https://appleid.apple.com/auth/keys',
    scope: 'name email',
    // Apple only sends name/email on the first authorization, and only to a
    // form_post callback.
    responseMode: 'form_post',
    clientId: () => process.env.APPLE_SERVICES_ID,
    clientSecret: () => appleClientSecret(),
  },
}

/**
 * Apple does not issue a static client secret: you mint a short-lived ES256 JWT
 * signed with the private key from your developer account.
 */
async function appleClientSecret(): Promise<string> {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_SERVICES_ID } = process.env
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY || !APPLE_SERVICES_ID) {
    throw new ApiError(500, 'Apple sign-in is not fully configured')
  }
  // Railway env vars collapse newlines, so accept the escaped form too.
  const pem = APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const key = await importPKCS8(pem, 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APPLE_KEY_ID })
    .setIssuer(APPLE_TEAM_ID)
    .setIssuedAt()
    .setExpirationTime('10m') // Apple's ceiling is 6 months; short is fine.
    .setAudience('https://appleid.apple.com')
    .setSubject(APPLE_SERVICES_ID)
    .sign(key)
}

export function isConfigured(provider: Provider): boolean {
  if (provider === 'google') {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  }
  return Boolean(
    process.env.APPLE_SERVICES_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
  )
}

/** The callback URL registered with the provider. Must match byte-for-byte. */
export function redirectUri(provider: Provider): string {
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '')
  if (!base) throw new ApiError(500, 'PUBLIC_API_URL is not set')
  return `${base}/api/auth/oauth/${provider}/callback`
}

export function authorizeUrl(provider: Provider, state: string): string {
  const cfg = CONFIG[provider]
  const clientId = cfg.clientId()
  if (!clientId || !isConfigured(provider)) {
    throw new ApiError(503, `${provider} sign-in is not configured`)
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: cfg.scope,
    state,
  })
  if (cfg.responseMode) params.set('response_mode', cfg.responseMode)
  return `${cfg.authUrl}?${params.toString()}`
}

const jwksCache = new Map<Provider, ReturnType<typeof createRemoteJWKSet>>()
function jwksFor(provider: Provider) {
  let set = jwksCache.get(provider)
  if (!set) {
    // Cached across calls so we aren't refetching keys on every sign-in.
    set = createRemoteJWKSet(new URL(CONFIG[provider].jwks))
    jwksCache.set(provider, set)
  }
  return set
}

interface Identity {
  providerId: string
  email: string
  emailVerified: boolean
  name?: string
  picture?: string
}

/** Trades the callback `code` for an ID token and verifies it. */
export async function exchangeCode(provider: Provider, code: string): Promise<Identity> {
  const cfg = CONFIG[provider]
  const clientId = cfg.clientId()
  if (!clientId) throw new ApiError(503, `${provider} sign-in is not configured`)

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await cfg.clientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(provider),
    }),
  })

  const payload = (await res.json().catch(() => ({}))) as any
  if (!res.ok || !payload.id_token) {
    throw new ApiError(401, payload.error_description || payload.error || 'Sign-in was rejected')
  }

  const { payload: claims } = await jwtVerify(payload.id_token, jwksFor(provider), {
    issuer: cfg.issuer as string | string[],
    audience: clientId,
  })

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : ''
  if (!email) throw new ApiError(401, `${provider} did not share an email address`)

  return {
    providerId: String(claims.sub),
    email,
    // Both providers send this as either a boolean or the string "true".
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name : undefined,
    picture: typeof claims.picture === 'string' ? claims.picture : undefined,
  }
}

/**
 * Finds or creates the account behind a verified provider identity.
 *
 * Linking is keyed on the provider id first, so it survives an email change at
 * the provider. Falling back to email is what lets someone who signed up with a
 * password later use the Google button on the same account -- but only when the
 * provider vouches that the address is verified, since otherwise anyone able to
 * assert an address at a sloppy provider could seize the account.
 */
export async function findOrCreateUser(provider: Provider, identity: Identity) {
  const idField = provider === 'google' ? 'googleId' : 'appleId'

  let user = await prisma.user.findFirst({ where: { [idField]: identity.providerId } })

  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } })
    if (byEmail) {
      if (!identity.emailVerified) {
        throw new ApiError(409, 'An account already uses this email address')
      }
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { [idField]: identity.providerId },
      })
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: identity.email,
        // Apple withholds the name unless it is the very first authorization.
        name: identity.name || identity.email.split('@')[0],
        avatar: identity.picture ?? null,
        [idField]: identity.providerId,
      },
    })
  }

  const token = generateToken({ userId: user.id, email: user.email })
  return { user: { id: user.id, email: user.email, name: user.name }, token }
}
