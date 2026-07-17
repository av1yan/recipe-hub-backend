// Password reset: issue a one-time link by email, and honour it once.
//
// The security rules this follows, and why:
//   - the token is stored hashed, so the table is not a list of live keys
//   - it expires in an hour and is single-use
//   - requesting a reset never reveals whether an account exists
//   - using a reset drops the account's other outstanding tokens

import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../utils/password.js'
import { ApiError } from '../middleware/errorHandler.js'
import { sendPasswordResetEmail } from './emailService.js'

const prisma = new PrismaClient()

const TOKEN_TTL_MINUTES = 60

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/**
 * Starts a reset. Always resolves — an unknown address must look exactly like a
 * known one, or this becomes a way to enumerate who has an account.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email.includes('@')) throw new ApiError(400, 'Enter the email address for your account')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return

  const token = crypto.randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
    },
  })

  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
  await sendPasswordResetEmail(user.email, user.name, `${base}/#reset=${token}`, TOKEN_TTL_MINUTES)
}

/** Applies a reset. The same message covers wrong, expired and already-used. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token) throw new ApiError(400, 'That reset link is not valid')
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, 'Choose a password of at least 8 characters')
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(400, 'That reset link has expired or been used already. Ask for a new one.')
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Any other link sitting in an inbox is now void.
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: null },
    }),
  ])
}
