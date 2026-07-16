import { PrismaClient } from '@prisma/client'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/jwt.js'
import { ApiError } from '../middleware/errorHandler.js'

const prisma = new PrismaClient()

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

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error('Invalid credentials')
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new Error('Invalid credentials')
  }

  const token = generateToken({ userId: user.id, email: user.email })
  return { user: { id: user.id, email: user.email, name: user.name }, token }
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, username: true, avatar: true, createdAt: true },
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
