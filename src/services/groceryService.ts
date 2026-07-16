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

export async function addItemToGroceryList(
  userId: string,
  listId: string,
  item: any
) {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, userId },
  })

  if (!list) {
    throw new Error('Grocery list not found')
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
  const item = await prisma.groceryItem.findUnique({
    where: { id: itemId },
    include: { groceryList: true },
  })

  if (!item || item.groceryList.userId !== userId) {
    throw new Error('Item not found')
  }

  return prisma.groceryItem.delete({ where: { id: itemId } })
}
