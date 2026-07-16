import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createMealPlan(userId: string, weekStart: Date, name?: string) {
  return prisma.mealPlan.create({
    data: { userId, weekStart, name },
    include: { meals: { include: { recipe: true } } },
  })
}

export async function getMealPlan(userId: string, id: string) {
  return prisma.mealPlan.findFirst({
    where: { id, userId },
    include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
  })
}

export async function listMealPlans(userId: string) {
  return prisma.mealPlan.findMany({
    where: { userId },
    include: { meals: { include: { recipe: true } } },
    orderBy: { weekStart: 'desc' },
  })
}

export async function addMealToMealPlan(
  userId: string,
  mealPlanId: string,
  recipeId: string,
  day: string,
  mealType: string
) {
  const mealPlan = await prisma.mealPlan.findFirst({
    where: { id: mealPlanId, userId },
  })

  if (!mealPlan) {
    throw new Error('Meal plan not found')
  }

  return prisma.mealPlanRecipe.create({
    data: { mealPlanId, recipeId, day, mealType },
  })
}

export async function removeMealFromMealPlan(userId: string, mealId: string) {
  const meal = await prisma.mealPlanRecipe.findUnique({
    where: { id: mealId },
    include: { mealPlan: true },
  })

  if (!meal || meal.mealPlan.userId !== userId) {
    throw new Error('Meal not found')
  }

  return prisma.mealPlanRecipe.delete({ where: { id: mealId } })
}
