import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { ApiError } from '../middleware/errorHandler.js'
import { prisma } from '../lib/prisma.js'

const router = Router()

// Human-typable codes: no 0/O/1/I so a code read off one phone can't be
// mistyped into another.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(len = 6): string {
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return out
}
async function uniqueCode(): Promise<string> {
  // Collisions are astronomically unlikely at 32^6, but check anyway.
  for (let i = 0; i < 8; i++) {
    const code = randomCode()
    const existing = await prisma.household.findUnique({ where: { inviteCode: code } })
    if (!existing) return code
  }
  throw new ApiError(500, 'Could not generate an invite code, please try again')
}

// The household the user belongs to (with membership), or null.
async function membershipOf(userId: string) {
  return prisma.householdMember.findFirst({
    where: { userId },
    include: { household: true },
  })
}

// Shape a household for the client: name, code, and the member roster.
async function serializeHousehold(householdId: string, viewerId: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
    },
  })
  if (!household) return null
  return {
    id: household.id,
    name: household.name,
    inviteCode: household.inviteCode,
    createdAt: household.createdAt,
    members: household.members.map(m => ({
      id: m.user.id,
      name: m.user.name,
      avatar: m.user.avatar,
      role: m.role,
      joinedAt: m.joinedAt,
      isYou: m.user.id === viewerId,
    })),
  }
}

// GET /api/household — the caller's household, or { household: null }.
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const membership = await membershipOf(req.user!.userId)
    if (!membership) return res.json({ household: null })
    res.json({ household: await serializeHousehold(membership.householdId, req.user!.userId) })
  } catch (err) {
    next(err)
  }
})

// POST /api/household — create a household and become its owner.
router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    if (await membershipOf(userId)) throw new ApiError(409, "You're already in a family. Leave it first to start a new one.")

    const name = (req.body?.name || '').trim() || 'My Family'
    const inviteCode = await uniqueCode()
    const household = await prisma.household.create({
      data: { name, inviteCode, members: { create: { userId, role: 'owner' } } },
    })
    res.json({ household: await serializeHousehold(household.id, userId) })
  } catch (err) {
    next(err)
  }
})

// POST /api/household/join — join with an invite code.
router.post('/join', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    if (await membershipOf(userId)) throw new ApiError(409, "You're already in a family. Leave it first to join another.")

    const code = (req.body?.code || '').trim().toUpperCase()
    if (!code) throw new ApiError(400, 'Enter an invite code')
    const household = await prisma.household.findUnique({ where: { inviteCode: code } })
    if (!household) throw new ApiError(404, "That code didn't match any family")

    await prisma.householdMember.create({ data: { householdId: household.id, userId, role: 'member' } })
    res.json({ household: await serializeHousehold(household.id, userId) })
  } catch (err) {
    next(err)
  }
})

// POST /api/household/leave — leave the current household. If the owner leaves,
// ownership passes to the next-oldest member; the last one out deletes it.
router.post('/leave', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const membership = await membershipOf(userId)
    if (!membership) throw new ApiError(400, "You're not in a family")

    const householdId = membership.householdId
    await prisma.householdMember.delete({ where: { id: membership.id } })

    const remaining = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { joinedAt: 'asc' },
    })
    if (remaining.length === 0) {
      // Cascade removes the shared grocery items too.
      await prisma.household.delete({ where: { id: householdId } })
    } else if (membership.role === 'owner' && !remaining.some(m => m.role === 'owner')) {
      await prisma.householdMember.update({ where: { id: remaining[0].id }, data: { role: 'owner' } })
    }
    res.json({ household: null })
  } catch (err) {
    next(err)
  }
})

// POST /api/household/regenerate-code — owner rolls the invite code (e.g. after
// it's been shared too widely). Old code stops working immediately.
router.post('/regenerate-code', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const membership = await membershipOf(userId)
    if (!membership) throw new ApiError(400, "You're not in a family")
    if (membership.role !== 'owner') throw new ApiError(403, 'Only the family owner can change the code')

    const inviteCode = await uniqueCode()
    await prisma.household.update({ where: { id: membership.householdId }, data: { inviteCode } })
    res.json({ household: await serializeHousehold(membership.householdId, userId) })
  } catch (err) {
    next(err)
  }
})

// --- Shared grocery list ---------------------------------------------------
// Every member reads and writes the same items; the client polls GET while the
// screen is open so changes made on other phones show up.

async function requireHouseholdId(userId: string): Promise<string> {
  const membership = await membershipOf(userId)
  if (!membership) throw new ApiError(400, 'Join or create a family first')
  return membership.householdId
}

// GET /api/household/grocery — the shared list.
router.get('/grocery', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = await requireHouseholdId(req.user!.userId)
    const items = await prisma.sharedGroceryItem.findMany({
      where: { householdId },
      orderBy: [{ checked: 'asc' }, { createdAt: 'asc' }],
    })
    res.json({ items })
  } catch (err) {
    next(err)
  }
})

// POST /api/household/grocery — add an item to the shared list.
router.post('/grocery', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const householdId = await requireHouseholdId(userId)
    const name = (req.body?.name || '').trim()
    if (!name) throw new ApiError(400, 'Item name is required')

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const item = await prisma.sharedGroceryItem.create({
      data: {
        householdId,
        name,
        quantity: Number(req.body?.quantity) || 1,
        unit: (req.body?.unit || 'piece').toString(),
        category: (req.body?.category || 'general').toString(),
        addedById: userId,
        addedByName: me?.name || null,
      },
    })
    res.json({ item })
  } catch (err) {
    next(err)
  }
})

// PUT /api/household/grocery/:itemId — toggle checked or rename.
router.put('/grocery/:itemId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = await requireHouseholdId(req.user!.userId)
    const existing = await prisma.sharedGroceryItem.findUnique({ where: { id: req.params.itemId } })
    if (!existing || existing.householdId !== householdId) throw new ApiError(404, 'Item not found')

    const data: { checked?: boolean; name?: string } = {}
    if (typeof req.body?.checked === 'boolean') data.checked = req.body.checked
    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim()
    const item = await prisma.sharedGroceryItem.update({ where: { id: existing.id }, data })
    res.json({ item })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/household/grocery/:itemId — remove one item.
router.delete('/grocery/:itemId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = await requireHouseholdId(req.user!.userId)
    const existing = await prisma.sharedGroceryItem.findUnique({ where: { id: req.params.itemId } })
    if (!existing || existing.householdId !== householdId) throw new ApiError(404, 'Item not found')
    await prisma.sharedGroceryItem.delete({ where: { id: existing.id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/household/grocery/clear-checked — sweep the ticked-off items.
router.post('/grocery/clear-checked', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = await requireHouseholdId(req.user!.userId)
    await prisma.sharedGroceryItem.deleteMany({ where: { householdId, checked: true } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
