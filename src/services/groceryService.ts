import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createGroceryList(userId: string, name: string) {
  return prisma.groceryList.create({
    data: { userId, name },
    include: { items: true },
  })
}

export async function getGroceryList(userId: string, id: string) {
  return prisma.groceryList.findFirst({
    where: { id, userId },
    include: { items: { include: { ingredient: true, recipe: true } } },
  })
}

export async function listGroceryLists(userId: string) {
  return prisma.groceryList.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })
}

// Two lines are "the same item" when their names match case-insensitively
// (after trimming) and they share a unit. Used to fold repeat adds into one row.
function itemKey(name: string, unit: string): string {
  return `${(name || '').trim().toLowerCase()}|${(unit || '').trim().toLowerCase()}`
}

export async function addItemToGroceryList(
  userId: string,
  listId: string,
  item: any
) {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, userId },
    include: { items: true },
  })

  if (!list) {
    throw new Error('Grocery list not found')
  }

  // Fold a repeat add into the existing line instead of piling up duplicate
  // rows ("Potato" + "potato" -> Potato x2). Only merge into a still-unchecked
  // line: a checked item is "already bought", so a fresh need starts its own row.
  const match = list.items.find(
    (i) => !i.checked && itemKey(i.name, i.unit) === itemKey(item.name, item.unit)
  )

  if (match) {
    return prisma.groceryItem.update({
      where: { id: match.id },
      data: { quantity: match.quantity + (item.quantity ?? 1) },
    })
  }

  return prisma.groceryItem.create({
    data: {
      groceryListId: listId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      recipeId: item.recipeId,
      ingredientId: item.ingredientId,
    },
  })
}

export async function updateGroceryItem(userId: string, itemId: string, checked: boolean) {
  const item = await prisma.groceryItem.findUnique({
    where: { id: itemId },
    include: { groceryList: true },
  })

  if (!item || item.groceryList.userId !== userId) {
    throw new Error('Item not found')
  }

  return prisma.groceryItem.update({
    where: { id: itemId },
    data: { checked },
  })
}

export async function removeGroceryItem(userId: string, itemId: string) {
  // Scope the delete to the caller's own lists and use deleteMany so a missing
  // or already-removed id is a harmless no-op rather than a 500. Deleting is
  // idempotent — the goal state is "item gone" — which keeps double-taps, stale
  // rows, and races from throwing (the old findUnique + throw turned all of
  // those into "Internal server error").
  const result = await prisma.groceryItem.deleteMany({
    where: { id: itemId, groceryList: { userId } },
  })
  return { deleted: result.count > 0 }
}
