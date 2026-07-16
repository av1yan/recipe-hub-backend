import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createMealPlan(userId: string, weekStart: Date, name?: string) {
  return prisma.mealPlan.create({
    data: { userId, weekStart, name },
    include: { meals: { include: { recipe: true } } },
  })
}

export async function getMealPlan(userId: string, id: string) {
  const plan = await prisma.mealPlan.findFirst({
    where: { id, userId },
    include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
  })

  if (!plan) return null

  // Transform flat meals array into nested structure by day and mealType
  const mealsByDay = plan.meals.reduce(
    (acc, meal) => {
      if (!acc[meal.day]) {
        acc[meal.day] = {}
      }
      acc[meal.day][meal.mealType] = meal.recipe
      return acc
    },
    {} as Record<string, Record<string, any>>
  )

  return {
    ...plan,
    meals: mealsByDay,
  }
}

export async function listMealPlans(userId: string) {
  const plans = await prisma.mealPlan.findMany({
    where: { userId },
    include: { meals: { include: { recipe: true } } },
    orderBy: { weekStart: 'desc' },
  })

  // Transform flat meals array into nested structure by day and mealType
  return plans.map(plan => {
    const mealsByDay = plan.meals.reduce(
      (acc, meal) => {
        if (!acc[meal.day]) {
          acc[meal.day] = {}
        }
        acc[meal.day][meal.mealType] = meal.recipe
        return acc
      },
      {} as Record<string, Record<string, any>>
    )

    return {
      ...plan,
      meals: mealsByDay,
    }
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
