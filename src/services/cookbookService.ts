import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createCookbook(userId: string, name: string, description?: string) {
  return prisma.cookbook.create({
    data: { userId, name, description },
    include: { recipes: { include: { recipe: true } } },
  })
}

export async function getCookbook(userId: string, id: string) {
  return prisma.cookbook.findFirst({
    where: { id, userId },
    include: { recipes: { include: { recipe: { include: { ingredients: true } } } } },
  })
}

export async function listCookbooks(userId: string) {
  return prisma.cookbook.findMany({
    where: { userId },
    include: { recipes: { include: { recipe: true } } },
  })
}

export async function addRecipeToCookbook(userId: string, cookbookId: string, recipeId: string) {
  const cookbook = await prisma.cookbook.findFirst({
    where: { id: cookbookId, userId },
  })

  if (!cookbook) {
    throw new Error('Cookbook not found')
  }

  return prisma.cookbookRecipe.create({
    data: { cookbookId, recipeId },
  })
}

export async function removeRecipeFromCookbook(userId: string, cookbookId: string, recipeId: string) {
  const cookbook = await prisma.cookbook.findFirst({
    where: { id: cookbookId, userId },
  })

  if (!cookbook) {
    throw new Error('Cookbook not found')
  }

  return prisma.cookbookRecipe.delete({
    where: { cookbookId_recipeId: { cookbookId, recipeId } },
  })
}
