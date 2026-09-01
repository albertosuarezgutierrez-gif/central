import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prismaPortal?: PrismaClient }

export const prisma = globalForPrisma.prismaPortal ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaPortal = prisma
