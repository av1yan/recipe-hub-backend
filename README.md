# RECIPhub Backend API

Complete backend for the RECIPhub recipe and meal planning application.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **Password Hashing**: bcryptjs

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/recipihub"
JWT_SECRET="your-super-secret-jwt-key"
PORT=5000
NODE_ENV=development
```

### Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema to database
npm run prisma:push

# (Optional) Seed with sample data
npm run seed
```

### Running

**Development**:
```bash
npm run dev
```

**Production**:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (requires auth)

### Recipes

- `GET /api/recipes` - List user's recipes (requires auth)
- `POST /api/recipes` - Create recipe (requires auth)
- `GET /api/recipes/:id` - Get recipe details
- `PUT /api/recipes/:id` - Update recipe (requires auth)
- `DELETE /api/recipes/:id` - Delete recipe (requires auth)
- `POST /api/recipes/:id/save` - Save recipe (requires auth)
- `DELETE /api/recipes/:id/save` - Unsave recipe (requires auth)
- `GET /api/recipes/saved/all` - Get saved recipes (requires auth)

### Meal Plans

- `GET /api/meal-plans` - List meal plans (requires auth)
- `POST /api/meal-plans` - Create meal plan (requires auth)
- `GET /api/meal-plans/:id` - Get meal plan (requires auth)
- `POST /api/meal-plans/:id/meals` - Add meal to plan (requires auth)
- `DELETE /api/meal-plans/meals/:mealId` - Remove meal (requires auth)

### Grocery Lists

- `GET /api/grocery-lists` - List grocery lists (requires auth)
- `POST /api/grocery-lists` - Create grocery list (requires auth)
- `GET /api/grocery-lists/:id` - Get grocery list (requires auth)
- `POST /api/grocery-lists/:id/items` - Add item to list (requires auth)
- `PUT /api/grocery-lists/items/:itemId` - Update item (requires auth)
- `DELETE /api/grocery-lists/items/:itemId` - Delete item (requires auth)

### Cookbooks

- `GET /api/cookbooks` - List cookbooks (requires auth)
- `POST /api/cookbooks` - Create cookbook (requires auth)
- `GET /api/cookbooks/:id` - Get cookbook (requires auth)
- `POST /api/cookbooks/:id/recipes` - Add recipe to cookbook (requires auth)
- `DELETE /api/cookbooks/:id/recipes/:recipeId` - Remove recipe from cookbook (requires auth)

## Authentication

Include JWT token in request header:

```
Authorization: Bearer <token>
```

## Example Requests

### Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "securepassword"
  }'
```

### Create Recipe

```bash
curl -X POST http://localhost:5000/api/recipes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pasta Carbonara",
    "cuisine": "Italian",
    "mealType": "lunch",
    "difficulty": "easy",
    "prepTime": 10,
    "cookTime": 20,
    "servings": 2,
    "calories": 580,
    "ingredients": [
      {"name": "Pasta", "quantity": 400, "unit": "g"},
      {"name": "Eggs", "quantity": 3, "unit": "whole"}
    ],
    "instructions": [
      {"text": "Cook pasta", "stepNumber": 1},
      {"text": "Mix eggs", "stepNumber": 2}
    ]
  }'
```

## Database Schema

See `prisma/schema.prisma` for complete schema. Key models:

- **User** - User accounts
- **Recipe** - User recipes with ingredients and instructions
- **Ingredient** - Recipe ingredients
- **Instruction** - Recipe cooking steps
- **Nutrition** - Nutritional information
- **MealPlan** - Weekly meal plans
- **MealPlanRecipe** - Meals assigned to plan
- **GroceryList** - Shopping lists
- **GroceryItem** - Items in shopping lists
- **Cookbook** - Recipe collections
- **SavedRecipe** - Bookmarked recipes
- **RecipeRating** - User recipe ratings

## Development

Run Prisma Studio to browse database:

```bash
npx prisma studio
```

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Set production environment variables

3. Run database migrations:
```bash
npm run prisma:push
```

4. Start the server:
```bash
npm start
```

## License

MIT
