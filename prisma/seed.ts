import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/utils/password.js'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create a test user
  const user = await prisma.user.create({
    data: {
      email: 'demo@recipihub.com',
      name: 'Demo User',
      passwordHash: await hashPassword('password123'),
    },
  })

  console.log(`✅ Created user: ${user.email}`)

  // Create sample recipes
  const recipe1 = await prisma.recipe.create({
    data: {
      userId: user.id,
      name: 'Pasta Carbonara',
      cuisine: 'Italian',
      mealType: 'lunch',
      difficulty: 'easy',
      prepTime: 10,
      cookTime: 20,
      servings: 2,
      calories: 580,
      description: 'Classic Italian pasta with eggs and bacon',
      ingredients: {
        create: [
          { name: 'Pasta', quantity: 400, unit: 'g' },
          { name: 'Eggs', quantity: 3, unit: 'whole' },
          { name: 'Bacon', quantity: 200, unit: 'g' },
          { name: 'Parmesan', quantity: 100, unit: 'g' },
        ],
      },
      instructions: {
        create: [
          { stepNumber: 1, text: 'Cook pasta in salted boiling water' },
          { stepNumber: 2, text: 'Fry bacon until crispy' },
          { stepNumber: 3, text: 'Mix eggs with grated parmesan' },
          { stepNumber: 4, text: 'Combine pasta with bacon and egg mixture' },
        ],
      },
      nutrition: {
        create: {
          calories: 580,
          protein: 28,
          carbs: 65,
          fat: 22,
          fiber: 3,
        },
      },
      tags: {
        create: [{ tag: 'quick' }, { tag: 'italian' }, { tag: 'pasta' }],
      },
    },
  })

  console.log(`✅ Created recipe: ${recipe1.name}`)

  // Create a meal plan
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const mealPlan = await prisma.mealPlan.create({
    data: {
      userId: user.id,
      weekStart,
      name: 'Weekly Plan',
      meals: {
        create: [
          {
            recipeId: recipe1.id,
            day: 'Monday',
            mealType: 'lunch',
          },
        ],
      },
    },
  })

  console.log(`✅ Created meal plan for week of ${weekStart.toDateString()}`)

  // Create a grocery list
  const groceryList = await prisma.groceryList.create({
    data: {
      userId: user.id,
      name: 'Weekly Shopping',
      items: {
        create: [
          { name: 'Pasta', quantity: 400, unit: 'g', category: 'Grains' },
          { name: 'Eggs', quantity: 12, unit: 'whole', category: 'Dairy' },
          { name: 'Bacon', quantity: 500, unit: 'g', category: 'Meat' },
          { name: 'Parmesan', quantity: 200, unit: 'g', category: 'Dairy' },
        ],
      },
    },
  })

  console.log(`✅ Created grocery list: ${groceryList.name}`)

  // Create a cookbook
  const cookbook = await prisma.cookbook.create({
    data: {
      userId: user.id,
      name: 'Italian Favorites',
      description: 'My favorite Italian recipes',
      recipes: {
        create: [
          {
            recipeId: recipe1.id,
          },
        ],
      },
    },
  })

  console.log(`✅ Created cookbook: ${cookbook.name}`)

  console.log('✨ Database seeded successfully!')
  console.log(`\n📧 Test account: demo@recipihub.com`)
  console.log(`🔐 Password: password123`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
