import { PrismaClient } from '@prisma/client'
import bcryptjs from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'Demo123456!'

interface SeedRecipe {
  name: string
  description: string
  cuisine: string
  mealType: string
  difficulty: string
  prepTime: number
  cookTime: number
  servings: number
  calories: number
  imageUrl: string
  ingredients: { name: string; quantity: number; unit: string }[]
  instructions: { text: string; duration: number | null }[]
  tags: string[]
}

// Tags drive the diet-preferences filter, so they have to be true of the
// recipe rather than aspirational -- the shakshuka leaves out the feta so
// "dairy-free" holds.
const RECIPES: SeedRecipe[] = [
  {
    name: "Chickpea Buddha Bowl",
    description: "A hearty, colorful bowl of roasted chickpeas, quinoa, and fresh veggies with a lemon-tahini drizzle.",
    cuisine: "Mediterranean",
    mealType: "lunch",
    difficulty: "easy",
    prepTime: 15,
    cookTime: 25,
    servings: 2,
    calories: 480,
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    ingredients: [
      { name: "Chickpeas", quantity: 1, unit: "can" },
      { name: "Quinoa", quantity: 1, unit: "cup" },
      { name: "Cherry tomatoes", quantity: 1, unit: "cup" },
      { name: "Cucumber", quantity: 1, unit: "whole" },
      { name: "Tahini", quantity: 2, unit: "tbsp" },
      { name: "Lemon", quantity: 1, unit: "whole" },
    ],
    instructions: [
      { text: "Rinse and drain the chickpeas, then roast at 200°C for 20 minutes until crisp.", duration: 20 },
      { text: "Cook the quinoa according to package directions and let cool slightly.", duration: null },
      { text: "Chop the cucumber and halve the cherry tomatoes.", duration: null },
      { text: "Whisk tahini with lemon juice and a splash of water to make the dressing.", duration: null },
      { text: "Assemble everything in a bowl and drizzle with the tahini dressing.", duration: null },
    ],
    tags: ["vegan", "vegetarian", "gluten-free", "dairy-free", "nut-free"],
  },
  {
    name: "Grilled Lemon Herb Salmon",
    description: "Flaky salmon fillets grilled with garlic, lemon, and fresh herbs. Light and protein-packed.",
    cuisine: "Mediterranean",
    mealType: "dinner",
    difficulty: "medium",
    prepTime: 10,
    cookTime: 15,
    servings: 2,
    calories: 420,
    imageUrl: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80",
    ingredients: [
      { name: "Salmon fillets", quantity: 2, unit: "whole" },
      { name: "Lemon", quantity: 1, unit: "whole" },
      { name: "Garlic", quantity: 2, unit: "cloves" },
      { name: "Fresh dill", quantity: 2, unit: "tbsp" },
      { name: "Olive oil", quantity: 1, unit: "tbsp" },
    ],
    instructions: [
      { text: "Pat the salmon dry and season with salt, pepper, and minced garlic.", duration: null },
      { text: "Heat the grill to medium-high and brush with olive oil.", duration: null },
      { text: "Grill the salmon skin-side down for 6 minutes, then flip and cook 4 more.", duration: 10 },
      { text: "Squeeze fresh lemon over the top and garnish with dill before serving.", duration: null },
    ],
    tags: ["keto", "low-carb", "gluten-free", "dairy-free", "nut-free"],
  },
  {
    name: "Classic Margherita Pizza",
    description: "A simple, timeless pizza with San Marzano tomatoes, fresh mozzarella, and basil.",
    cuisine: "Italian",
    mealType: "dinner",
    difficulty: "medium",
    prepTime: 20,
    cookTime: 12,
    servings: 4,
    calories: 620,
    imageUrl: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80",
    ingredients: [
      { name: "Pizza dough", quantity: 1, unit: "ball" },
      { name: "San Marzano tomatoes", quantity: 1, unit: "can" },
      { name: "Fresh mozzarella", quantity: 200, unit: "g" },
      { name: "Fresh basil", quantity: 1, unit: "handful" },
    ],
    instructions: [
      { text: "Stretch the pizza dough into a round on a floured surface.", duration: null },
      { text: "Spread crushed tomatoes and tear mozzarella over the top.", duration: null },
      { text: "Bake at the highest oven temperature for 10-12 minutes until bubbly.", duration: 12 },
      { text: "Finish with fresh basil leaves and a drizzle of olive oil.", duration: null },
    ],
    tags: ["vegetarian"],
  },
  {
    name: "Thai Peanut Noodles",
    description: "Silky rice noodles tossed in a creamy peanut-lime sauce with crunchy veggies.",
    cuisine: "Asian",
    mealType: "dinner",
    difficulty: "easy",
    prepTime: 15,
    cookTime: 10,
    servings: 3,
    calories: 540,
    imageUrl: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=80",
    ingredients: [
      { name: "Rice noodles", quantity: 200, unit: "g" },
      { name: "Peanut butter", quantity: 3, unit: "tbsp" },
      { name: "Soy sauce", quantity: 2, unit: "tbsp" },
      { name: "Lime", quantity: 1, unit: "whole" },
      { name: "Bell pepper", quantity: 1, unit: "whole" },
    ],
    instructions: [
      { text: "Soak the rice noodles in hot water until tender, then drain.", duration: null },
      { text: "Whisk peanut butter, soy sauce, and lime juice into a smooth sauce.", duration: null },
      { text: "Slice the bell pepper thinly and toss with the noodles and sauce.", duration: null },
      { text: "Top with crushed peanuts and serve warm or at room temperature.", duration: null },
    ],
    tags: ["vegan", "vegetarian", "dairy-free"],
  },
  {
    name: "Shakshuka",
    description: "Eggs gently poached in a smoky tomato and pepper sauce, straight from the pan. A one-skillet breakfast that also makes a fine dinner.",
    cuisine: "Middle Eastern",
    mealType: "breakfast",
    difficulty: "easy",
    prepTime: 10,
    cookTime: 20,
    servings: 2,
    calories: 320,
    imageUrl: "https://images.unsplash.com/photo-1590412200988-a436970781fa?w=800&q=80",
    ingredients: [
      { name: "Eggs", quantity: 4, unit: "whole" },
      { name: "Chopped tomatoes", quantity: 1, unit: "can" },
      { name: "Red bell pepper", quantity: 1, unit: "whole" },
      { name: "Onion", quantity: 1, unit: "whole" },
      { name: "Garlic", quantity: 3, unit: "cloves" },
      { name: "Smoked paprika", quantity: 1, unit: "tsp" },
      { name: "Ground cumin", quantity: 1, unit: "tsp" },
      { name: "Olive oil", quantity: 2, unit: "tbsp" },
      { name: "Fresh parsley", quantity: 2, unit: "tbsp" },
    ],
    instructions: [
      { text: "Warm the olive oil in a wide skillet over medium heat. Soften the sliced onion and pepper for about 8 minutes.", duration: 8 },
      { text: "Stir in the garlic, paprika and cumin and cook for a minute, until they smell toasted rather than raw.", duration: 1 },
      { text: "Pour in the tomatoes, season, and simmer until thick enough to hold a channel when you drag a spoon through it.", duration: 10 },
      { text: "Make four wells in the sauce and crack an egg into each. Cover and cook until the whites set but the yolks stay soft.", duration: 6 },
      { text: "Scatter with parsley and serve straight from the pan.", duration: 1 },
    ],
    tags: ["vegetarian", "gluten-free", "dairy-free", "nut-free", "high-protein"],
  },
  {
    name: "Chicken Tikka Masala",
    description: "Yogurt-marinated chicken charred under the grill, then folded into a creamy spiced tomato sauce. Serve over rice.",
    cuisine: "Indian",
    mealType: "dinner",
    difficulty: "medium",
    prepTime: 20,
    cookTime: 30,
    servings: 4,
    calories: 610,
    imageUrl: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=800&q=80",
    ingredients: [
      { name: "Chicken thighs", quantity: 700, unit: "g" },
      { name: "Plain yogurt", quantity: 150, unit: "g" },
      { name: "Garam masala", quantity: 2, unit: "tbsp" },
      { name: "Ground turmeric", quantity: 1, unit: "tsp" },
      { name: "Ginger", quantity: 1, unit: "tbsp" },
      { name: "Garlic", quantity: 4, unit: "cloves" },
      { name: "Passata", quantity: 400, unit: "g" },
      { name: "Double cream", quantity: 150, unit: "ml" },
      { name: "Basmati rice", quantity: 300, unit: "g" },
    ],
    instructions: [
      { text: "Mix the yogurt with half the garam masala, the turmeric, ginger and garlic. Coat the diced chicken and leave it for at least 20 minutes.", duration: 20 },
      { text: "Spread the chicken on a tray and grill on high until the edges char. The colour is the point, so do not crowd the tray.", duration: 12 },
      { text: "Fry the remaining garam masala in a little oil for 30 seconds, then add the passata and simmer.", duration: 10 },
      { text: "Stir in the cream, then the grilled chicken and any juices from the tray. Simmer until the sauce coats the chicken.", duration: 8 },
      { text: "Serve over basmati rice.", duration: 1 },
    ],
    tags: ["gluten-free", "nut-free", "high-protein"],
  },
]

async function main() {
  console.log('🌱 Seeding database...')

  // Upsert rather than bail when the user exists, so re-running tops up an
  // existing database with any recipes added since.
  const passwordHash = await bcryptjs.hash(DEMO_PASSWORD, 10)
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Demo User', passwordHash },
  })
  console.log(`✅ Demo user: ${user.email}`)

  let created = 0
  for (const recipe of RECIPES) {
    const existing = await prisma.recipe.findFirst({
      where: { userId: user.id, name: recipe.name },
      select: { id: true },
    })
    if (existing) continue

    const { ingredients, instructions, tags, ...fields } = recipe
    await prisma.recipe.create({
      data: {
        ...fields,
        userId: user.id,
        ingredients: { create: ingredients },
        instructions: {
          create: instructions.map((step, i) => ({ ...step, stepNumber: i + 1 })),
        },
        tags: { create: tags.map(tag => ({ tag })) },
      },
    })
    created++
  }

  console.log(`✅ Recipes: ${created} created, ${RECIPES.length - created} already present`)
  console.log(`\n📧 Email: ${DEMO_EMAIL}`)
  console.log(`🔑 Password: ${DEMO_PASSWORD}`)
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
