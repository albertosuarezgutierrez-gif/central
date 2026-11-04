// Cliente Prisma del schema `taller` (rol prisma_taller, NOBYPASSRLS). Úsalo SOLO a través de `conTaller`.
import { PrismaClient, type Prisma } from '@prisma/client'
import { crearConTaller, type ClienteConTx } from './rls.ts'

const globalForPrisma = globalThis as unknown as { prismaTaller?: PrismaClient }

const prisma = globalForPrisma.prismaTaller ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaTaller = prisma

export type Tx = Prisma.TransactionClient

/** `conTaller(tallerId, tx => …)`: abre transacción, fija el taller para RLS y ejecuta. Sin taller → lanza. */
export const conTaller = crearConTaller<Tx>(prisma as unknown as ClienteConTx<Tx>)
