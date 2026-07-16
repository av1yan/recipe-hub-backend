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
  return prisma.recipe.findMany({
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
    },
    take: filters?.limit || 20,
    skip: filters?.offset || 0,
  })
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
  return prisma.savedRecipe.create({
    data: { userId, recipeId },
  })
}

export async function unsaveRecipe(userId: string, recipeId: string) {
  return prisma.savedRecipe.delete({
    where: { userId_recipeId: { userId, recipeId } },
  })
}

export async function getSavedRecipes(userId: string) {
  return prisma.savedRecipe.findMany({
    where: { userId },
    include: { recipe: { include: { ingredients: true, instructions: true } } },
  })
}
