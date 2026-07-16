# recipHub Backend API 🍳

Complete backend API for the recipHub recipe and meal planning application. Built with Express.js, TypeScript, Prisma ORM, and SQLite.

## Features

- 🔐 **User Authentication** - JWT-based auth with bcrypt password hashing
- 📖 **Recipe Management** - Create, read, update, delete personal recipes
- 📅 **Meal Planning** - Plan weekly meals and organize recipes by day/meal type
- 🛒 **Grocery Lists** - Generate and manage shopping lists from meal plans
- 📚 **Cookbooks** - Organize recipes into custom collections
- 📊 **Nutrition Tracking** - Store and track recipe nutrition information
- ✅ **Data Validation** - Input validation and error handling throughout

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Language**: TypeScript 5.x
- **Database**: SQLite (development) / PostgreSQL (production-ready)
- **ORM**: Prisma 5.x
- **Authentication**: JSON Web Tokens (JWT)
- **Password Hashing**: bcryptjs
- **CORS**: Enabled for frontend integration

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/av1yan/recipe-hub-backend.git
cd recipe-hub-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key"
PORT=5001
NODE_ENV=development
```

4. Generate Prisma client:
```bash
npx prisma generate
```

5. Push database schema:
```bash
npx prisma db push
```

6. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:5001`

## Project Structure

```
src/
├── routes/               # API route handlers
│   ├── auth.ts          # Authentication endpoints
│   ├── recipes.ts       # Recipe management
│   ├── mealPlans.ts     # Meal planning
│   ├── groceryLists.ts  # Grocery lists
│   └── cookbooks.ts     # Cookbook management
├── services/            # Business logic
│   ├── authService.ts
│   ├── recipeService.ts
│   ├── mealPlanService.ts
│   ├── groceryService.ts
│   └── cookbookService.ts
├── middleware/          # Express middleware
│   ├── auth.ts          # JWT authentication
│   └── errorHandler.ts  # Global error handling
└── index.ts             # App entry point

prisma/
└── schema.prisma        # Database schema
```

## API Endpoints

### Authentication

```
POST /api/auth/register
  Body: { email, name, password }
  Response: { token, user: { id, email, name } }

POST /api/auth/login
  Body: { email, password }
  Response: { token, user: { id, email, name } }

GET /api/auth/profile
  Headers: Authorization: Bearer <token>
  Response: { id, email, name }
```

### Recipes

```
GET /api/recipes
  Headers: Authorization: Bearer <token>
  Response: Recipe[]

POST /api/recipes
  Headers: Authorization: Bearer <token>
  Body: { name, cuisine, difficulty, prepTime, cookTime, servings, calories, ingredients[], instructions[] }
  Response: Recipe

GET /api/recipes/:id
  Response: Recipe (with ingredients and instructions)

PUT /api/recipes/:id
  Headers: Authorization: Bearer <token>
  Body: { name, cuisine, ... }
  Response: Recipe

DELETE /api/recipes/:id
  Headers: Authorization: Bearer <token>
  Response: { success: true }

POST /api/recipes/:id/save
  Headers: Authorization: Bearer <token>
  Response: { success: true }

DELETE /api/recipes/:id/save
  Headers: Authorization: Bearer <token>
  Response: { success: true }

GET /api/recipes/saved/all
  Headers: Authorization: Bearer <token>
  Response: Recipe[]
```

### Meal Plans

```
GET /api/meal-plans
  Headers: Authorization: Bearer <token>
  Response: MealPlan[]

POST /api/meal-plans
  Headers: Authorization: Bearer <token>
  Body: { weekStart, name? }
  Response: MealPlan

GET /api/meal-plans/:id
  Headers: Authorization: Bearer <token>
  Response: MealPlan (with meals organized by day/type)

POST /api/meal-plans/:id/meals
  Headers: Authorization: Bearer <token>
  Body: { recipeId, day, mealType }
  Response: MealPlan (updated)

DELETE /api/meal-plans/meals/:mealId
  Headers: Authorization: Bearer <token>
  Response: { success: true }
```

### Grocery Lists

```
GET /api/grocery-lists
  Headers: Authorization: Bearer <token>
  Response: GroceryList[]

POST /api/grocery-lists
  Headers: Authorization: Bearer <token>
  Body: { name, mealPlanId? }
  Response: GroceryList

GET /api/grocery-lists/:id
  Headers: Authorization: Bearer <token>
  Response: GroceryList (with items)

POST /api/grocery-lists/:id/items
  Headers: Authorization: Bearer <token>
  Body: { ingredientName, quantity, unit, checked? }
  Response: GroceryItem

PUT /api/grocery-lists/items/:itemId
  Headers: Authorization: Bearer <token>
  Body: { quantity?, checked? }
  Response: GroceryItem

DELETE /api/grocery-lists/items/:itemId
  Headers: Authorization: Bearer <token>
  Response: { success: true }
```

### Cookbooks

```
GET /api/cookbooks
  Headers: Authorization: Bearer <token>
  Response: Cookbook[]

POST /api/cookbooks
  Headers: Authorization: Bearer <token>
  Body: { name, description? }
  Response: Cookbook

GET /api/cookbooks/:id
  Headers: Authorization: Bearer <token>
  Response: Cookbook (with recipes)

POST /api/cookbooks/:id/recipes
  Headers: Authorization: Bearer <token>
  Body: { recipeId }
  Response: Cookbook (updated)

DELETE /api/cookbooks/:id/recipes/:recipeId
  Headers: Authorization: Bearer <token>
  Response: { success: true }
```

## Database Schema

### Core Models

- **User** - User accounts and authentication
- **Recipe** - User recipes with full details
- **Ingredient** - Individual ingredients with quantities
- **Instruction** - Step-by-step cooking instructions
- **Nutrition** - Nutritional information per recipe

### Meal Planning

- **MealPlan** - Weekly meal plans
- **MealPlanRecipe** - Meals assigned to specific days/times

### Collections

- **GroceryList** - Shopping lists
- **GroceryItem** - Items in shopping lists
- **Cookbook** - Recipe collections
- **CookbookRecipe** - Recipes in cookbooks

### User Interactions

- **SavedRecipe** - Bookmarked recipes
- **RecipeRating** - User ratings on recipes

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled JavaScript (production)
- `npx prisma studio` - Open Prisma Studio to browse database
- `npx prisma db push` - Sync database schema
- `npx prisma generate` - Generate Prisma client

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:./dev.db` |
| `JWT_SECRET` | Secret key for JWT signing | (required) |
| `PORT` | Server port | `5001` |
| `NODE_ENV` | Environment | `development` |

### Testing API

Use curl or Postman:

```bash
# Register
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","name":"John","password":"pass123"}'

# Login
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123"}'

# Get recipes (with token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/recipes
```

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message",
  "status": 400
}
```

Common status codes:
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not found
- `500` - Server error

## Production Deployment

### Database Migration (PostgreSQL)

Update `.env`:
```env
DATABASE_URL="postgresql://user:password@host:5432/recipihub"
```

Push schema:
```bash
npx prisma db push
```

### Build & Deploy

```bash
npm run build
npm start
```

### Environment Variables (Production)

Set these in your hosting platform:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Strong random secret key
- `PORT` - Server port
- `NODE_ENV` - `production`

## Performance Notes

- Database queries optimized with Prisma relations
- JWT authentication is stateless
- CORS enabled for frontend communication
- Error handling prevents stack trace exposure in production

## Security

- Passwords hashed with bcryptjs (12 rounds)
- JWT tokens for authentication
- SQL injection protection via Prisma
- CORS headers configured
- Input validation on all endpoints

## License

MIT

## Support

For issues or questions, please open an issue on GitHub at [av1yan/recipe-hub-backend](https://github.com/av1yan/recipe-hub-backend/issues)

---

**Frontend Repository**: [av1yan/recipe-hub](https://github.com/av1yan/recipe-hub)
# Deployment trigger: Wed Jul 15 22:59:34 CDT 2026
