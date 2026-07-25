import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/jwt.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function registerUser(email: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error('User already exists')
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  })

  const token = generateToken({ userId: user.id, email: user.email })
  return { user: { id: user.id, email: user.email, name: user.name }, token }
}

/**
 * Signs in with either an email address or a username.
 *
 * Usernames are stored as entered but compared case-insensitively, so someone
 * who registered "Chef_Demo" can still sign in typing "chef_demo". Emails were
 * already stored lowercase.
 */
export async function loginUser(identifier: string, password: string) {
  const id = identifier.trim()
  const user = id.includes('@')
    ? await prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.user.findFirst({ where: { username: { equals: id, mode: 'insensitive' } } })

  if (!user) {
    throw new ApiError(401, 'Invalid credentials')
  }

  // An account created through Google/Apple has no password to check against.
  // Say so plainly: "invalid credentials" would send them off hunting for a
  // password that never existed.
  if (!user.passwordHash) {
    const via = user.googleId ? 'Google' : 'Apple'
    throw new ApiError(401, `This account signs in with ${via}`)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new ApiError(401, 'Invalid credentials')
  }

  const token = generateToken({ userId: user.id, email: user.email })
  return { user: { id: user.id, email: user.email, name: user.name }, token }
}

/**
 * Permanently deletes the account and everything it owns. The schema's
 * onDelete: Cascade rules take care of recipes, meal plans, grocery lists,
 * cookbooks, ratings, saved recipes, reset tokens and household memberships;
 * SharedGroceryItem.addedBy is nulled so a shared item survives with no author.
 * This is the real server-side deletion the App Store requires.
 */
export async function deleteUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } })
}

/**
 * Changes the password for a password account after re-checking the current one.
 * Accounts created through Google/Apple have no password to change.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new ApiError(404, 'User not found')
  if (!user.passwordHash) {
    const via = user.googleId ? 'Google' : 'Apple'
    throw new ApiError(400, `This account signs in with ${via}, so there's no password to change`)
  }
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) throw new ApiError(401, 'Your current password is incorrect')
  if (newPassword.length < 8) throw new ApiError(400, 'New password must be at least 8 characters')
  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, username: true, avatar: true, createdAt: true,
      isPro: true, proExpiresAt: true, proSource: true,
    },
  })
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; username?: string | null }
) {
  const updates: { name?: string; username?: string | null } = {}

  if (typeof data.name === 'string') {
    const name = data.name.trim()
    if (!name) throw new ApiError(400, 'Name cannot be empty')
    updates.name = name
  }

  if (typeof data.username === 'string') {
    const username = data.username.trim()
    if (username) {
      if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) {
        throw new ApiError(400, 'Username must be 3–20 characters: letters, numbers, _ or .')
      }
      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
      })
      if (taken) throw new ApiError(409, 'That username is already taken')
      updates.username = username
    } else {
      updates.username = null // allow clearing it
    }
  }

  await prisma.user.update({ where: { id: userId }, data: updates })
  return getUserProfile(userId)
}
