import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key'

// Long-lived by default: this powers a shared demo login that should stay
// signed in across showcases rather than lapsing after a week and dumping
// everyone back on the sign-in screen. Override with JWT_EXPIRES_IN (any
// jsonwebtoken duration, e.g. "7d" or "12h") for deployments that want
// shorter-lived sessions.
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '365d') as jwt.SignOptions['expiresIn']

export interface TokenPayload {
  userId: string
  email: string
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}
