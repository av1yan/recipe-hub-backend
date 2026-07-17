import { PrismaClient } from '@prisma/client'
import { ApiError } from '../middleware/errorHandler.js'

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
    (acc: Record<string, Record<string, any>>, meal: any) => {
      if (!acc[meal.day]) {
        acc[meal.day] = {}
      }
      // Carry the link's own id through. Flattening to just the recipe threw
      // it away, and without it nothing can say which meal to remove -- a
      // recipe id is not enough, the same recipe can sit in several slots.
      acc[meal.day][meal.mealType] = { ...meal.recipe, mealId: meal.id }
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
  return plans.map((plan: any) => {
    const mealsByDay = plan.meals.reduce(
      (acc: Record<string, Record<string, any>>, meal: any) => {
        if (!acc[meal.day]) {
          acc[meal.day] = {}
        }
        acc[meal.day][meal.mealType] = { ...meal.recipe, mealId: meal.id }
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
    throw new ApiError(404, 'Meal plan not found')
  }

  // A (day, mealType) slot holds one recipe -- the schema enforces it with
  // @@unique([mealPlanId, day, mealType]). Adding to a slot that's already
  // filled must replace what's there; a plain create would hit that constraint
  // and surface as an opaque 500.
  return prisma.mealPlanRecipe.upsert({
    where: { mealPlanId_day_mealType: { mealPlanId, day, mealType } },
    update: { recipeId },
    create: { mealPlanId, recipeId, day, mealType },
  })
}

export async function deleteMealPlan(userId: string, id: string) {
  const plan = await prisma.mealPlan.findFirst({ where: { id, userId } })
  if (!plan) {
    throw new ApiError(404, 'Meal plan not found')
  }
  // Remove the plan's meals first so the delete succeeds regardless of cascade config.
  await prisma.mealPlanRecipe.deleteMany({ where: { mealPlanId: id } })
  return prisma.mealPlan.delete({ where: { id } })
}

export async function removeMealFromMealPlan(userId: string, mealId: string) {
  const meal = await prisma.mealPlanRecipe.findUnique({
    where: { id: mealId },
    include: { mealPlan: true },
  })

  if (!meal || meal.mealPlan.userId !== userId) {
    throw new ApiError(404, 'Meal not found')
  }

  return prisma.mealPlanRecipe.delete({ where: { id: mealId } })
}
