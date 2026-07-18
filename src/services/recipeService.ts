import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createRecipe(userId: string, data: any) {
  const recipe = await prisma.recipe.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      cuisine: data.cuisine,
      mealType: data.mealType,
      difficulty: data.difficulty,
      prepTime: data.prepTime,
      cookTime: data.cookTime,
      servings: data.servings,
      calories: data.calories,
      imageUrl: data.imageUrl,
      sourceUrl: data.sourceUrl,
      ingredients: {
        create: data.ingredients || [],
      },
      instructions: {
        create: (data.instructions || []).map((step: any, idx: number) => ({
          ...step,
          stepNumber: idx + 1,
        })),
      },
      nutrition: data.nutrition ? { create: data.nutrition } : undefined,
      tags: {
        create: (data.tags || []).map((tag: string) => ({ tag })),
      },
    },
    include: {
      ingredients: true,
      instructions: true,
      nutrition: true,
      tags: true,
    },
  })

  return recipe
}

export async function getRecipe(id: string) {
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: true,
      instructions: true,
      nutrition: true,
      tags: true,
      ratings: true,
    },
  })
}

export async function listRecipes(userId: string, filters?: any) {
  const recipes = await prisma.recipe.findMany({
    where: {
      userId,
      ...(filters?.cuisine && { cuisine: filters.cuisine }),
      ...(filters?.mealType && { mealType: filters.mealType }),
      ...(filters?.difficulty && { difficulty: filters.difficulty }),
    },
    include: {
      ingredients: true,
      instructions: true,
      nutrition: true,
      // Just this user's save row, so each recipe can carry its own
      // favorite state instead of the client having to guess.
      savedBy: { where: { userId }, select: { id: true } },
    },
    take: filters?.limit || 20,
    skip: filters?.offset || 0,
  })
  return recipes.map(({ savedBy, ...r }) => ({ ...r, isFavorite: savedBy.length > 0 }))
}

export async function updateRecipe(userId: string, id: string, data: any) {
  const recipe = await prisma.recipe.findFirst({
    where: { id, userId },
  })

  if (!recipe) {
    throw new Error('Recipe not found')
  }

  return prisma.recipe.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      cuisine: data.cuisine,
      mealType: data.mealType,
      difficulty: data.difficulty,
      prepTime: data.prepTime,
      cookTime: data.cookTime,
      servings: data.servings,
      calories: data.calories,
      imageUrl: data.imageUrl,
      userNotes: data.userNotes,
    },
    include: {
      ingredients: true,
      instructions: true,
      nutrition: true,
      tags: true,
    },
  })
}

export async function deleteRecipe(userId: string, id: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id, userId },
  })

  if (!recipe) {
    throw new Error('Recipe not found')
  }

  return prisma.recipe.delete({ where: { id } })
}

export async function saveRecipe(userId: string, recipeId: string) {
  // Idempotent: favoriting something already favorited is a no-op, not a 500.
  return prisma.savedRecipe.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId },
    update: {},
  })
}

export async function unsaveRecipe(userId: string, recipeId: string) {
  // deleteMany so un-favoriting something not saved is a no-op, not a P2025.
  return prisma.savedRecipe.deleteMany({
    where: { userId, recipeId },
  })
}

export async function getSavedRecipes(userId: string) {
  return prisma.savedRecipe.findMany({
    where: { userId },
    include: { recipe: { include: { ingredients: true, instructions: true } } },
  })
}
