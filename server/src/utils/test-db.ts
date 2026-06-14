import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config()

async function test() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const cohort = await prisma.cohort.findUnique({
      where: { inviteCode: 'SPH-002-2026-INVITE' },
      include: { organization: true },
    })
    console.log('Cohort found:', JSON.stringify(cohort, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

test()
