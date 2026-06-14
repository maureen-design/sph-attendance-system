import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  const connectionString = process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  console.log('🌱 Seeding SPH database...')

  // ─── Organization ───────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: 'sph-org-001' },
    update: {},
    create: {
      id: 'sph-org-001',
      name: 'Swahilipot Hub',
      shortName: 'SPH',
      contactEmail: 'info@swahilipothub.org',
    },
  })
  console.log(`✅ Organization: ${org.name}`)

  // ─── Departments ────────────────────────────────
  const departments = [
    { id: 'dept-tech', name: 'Tech', shiftStartTime: '08:00', shiftEndTime: '17:00', cutoffTime: '10:00' },
    { id: 'dept-comm', name: 'Communication', shiftStartTime: '08:30', shiftEndTime: '17:00', cutoffTime: '10:30' },
    { id: 'dept-creative', name: 'Creatives', shiftStartTime: '09:00', shiftEndTime: '17:00', cutoffTime: '11:00' },
    { id: 'dept-youth', name: 'Youth Engagement', shiftStartTime: '08:30', shiftEndTime: '16:30', cutoffTime: '10:30' },
    { id: 'dept-admin', name: 'Administration', shiftStartTime: '08:00', shiftEndTime: '17:00', cutoffTime: '10:00' },
  ]

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { id: dept.id },
      update: {},
      create: { ...dept, organizationId: org.id },
    })
    console.log(`✅ Department: ${dept.name}`)
  }

  // ─── Cohort ─────────────────────────────────────
  const cohort = await prisma.cohort.upsert({
    where: { id: 'cohort-002-2026' },
    update: {},
    create: {
      id: 'cohort-002-2026',
      name: 'SPH 002 2026',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-09-30'),
      organizationId: org.id,
      inviteCode: 'SPH-002-2026-INVITE',
      inviteExpiry: new Date('2026-07-01'),
      isActive: true,
    },
  })
  console.log(`✅ Cohort: ${cohort.name} | Invite Code: ${cohort.inviteCode}`)

  // ─── Super Admin ─────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@SPH2026', 12)

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@swahilipothub.org' },
    update: {},
    create: {
      fullName: 'SPH Administrator',
      email: 'admin@swahilipothub.org',
      passwordHash,
      role: 'SUPER_ADMIN',
      organizationId: org.id,
      isVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Super Admin: ${superAdmin.email} | Password: Admin@SPH2026`)

  console.log('\n🎉 Seed complete!')
  console.log('─────────────────────────────────────────')
  console.log(`Organization: Swahilipot Hub (SPH)`)
  console.log(`Cohort Invite Code: SPH-002-2026-INVITE`)
  console.log(`Admin Email: admin@swahilipothub.org`)
  console.log(`Admin Password: Admin@SPH2026`)
  console.log('─────────────────────────────────────────')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('❌ Seed failed:', e)
  process.exit(1)
})
