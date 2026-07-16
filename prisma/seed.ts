import { PrismaClient } from '@prisma/client'
import bcryptjs from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')
  
  // Check if test user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'demo@example.com' }
  })
  
  if (existingUser) {
    console.log('✅ Test user already exists')
    return
  }
  
  // Create test user
  const hashedPassword = await bcryptjs.hash('Demo123456!', 10)
  
  const user = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      name: 'Demo User',
      passwordHash: hashedPassword
    }
  })
  
  console.log('✅ Test user created:', user.email)
  console.log('📧 Email: demo@example.com')
  console.log('🔑 Password: Demo123456!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
