// Cliente Prisma del schema `taller` (rol prisma_taller, NOBYPASSRLS). Úsalo SOLO a través de `conTaller`.
import { PrismaClient, type Prisma } from '@prisma/client'
import { crearConTaller, type ClienteConTx } from './rls.ts'

const globalForPrisma = globalThis as unknown as { prismaTaller?: PrismaClient }

const prisma = globalForPrisma.prismaTaller ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaTaller = prisma

export type Tx = Prisma.TransactionClient

/** `conTaller(tallerId, tx => …)`: abre transacción, fija el taller para RLS y ejecuta. Sin taller → lanza. */
export const conTaller = crearConTaller<Tx>(prisma as unknown as ClienteConTx<Tx>)

/**
 * Alta de la FILA del taller (solo el operador, 0004): `taller.alta_taller()` es SECURITY DEFINER porque el rol de la app no tiene
 * INSERT en `talleres`. Idempotente por NIF (`creado: false` si ya existía). Es la única consulta fuera de `conTaller`: no lee
 * datos de ningún taller, solo crea/localiza el id.
 */
export async function altaTallerBd(d: { razonSocial: string; nombreComercial: string; nif: string | null }): Promise<{ id: string; creado: boolean }> {
  const filas = await prisma.$queryRaw<Array<{ o_id: string; o_creado: boolean }>>`
    SELECT o_id, o_creado FROM taller.alta_taller(${d.razonSocial}::text, ${d.nombreComercial}::text, ${d.nif}::text)`
  if (!filas[0]) throw new Error('alta_taller no devolvió fila')
  return { id: filas[0].o_id, creado: filas[0].o_creado }
}
