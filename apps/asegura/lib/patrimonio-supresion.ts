// Supresión (art. 17 RGPD) → borra también las señales de patrimonio (§0.2 del borrador P15). Mismo patrón de BD que la
// purga de retención de `patrimonio-senales.ts`: SQL crudo parametrizado con `prisma_seguros` (tiene DELETE; el portal no).
// Corre SIEMPRE, con el interruptor `PATRIMONIO_SENALES_ACTIVAS` apagado o no: una supresión no puede depender de él.
import { NIVELES, puedeAutorizar, type Nivel } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { fichasASuprimir, idsDeSenalesASuprimir } from './patrimonio-supresion-reglas'

const nivelDe = (v: string): Nivel => ((NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta')

/** Devuelve cuántas señales se han borrado. Lanza si la BD falla (el llamador lo registra como «no borradas»). */
export async function borrarSenalesDeSupresion(entrada: {
  correduriaId: string
  identidadId: string
  clienteId: string | null
}): Promise<number> {
  const db = prismaAsegura()
  const vinculos = await db.portalVinculo.findMany({
    where: { correduriaId: entrada.correduriaId, identidadId: entrada.identidadId },
    select: { clienteId: true, nivel: true, origen: true },
  })
  const fichas = fichasASuprimir(
    entrada.clienteId,
    vinculos.map((v) => ({ clienteId: v.clienteId, origen: v.origen, puedeAutorizar: puedeAutorizar(nivelDe(v.nivel)) })),
  )
  if (fichas.length === 0) return 0
  const filas = await db.$queryRaw<{ id: string; correduria_id: string; cliente_id: string }[]>(
    Prisma.sql`select id, correduria_id, cliente_id from portal_patrimonio_senal
      where correduria_id = ${entrada.correduriaId}::uuid and cliente_id = any(${fichas}::uuid[])`,
  )
  const ids = idsDeSenalesASuprimir(
    filas.map((f) => ({ id: f.id, correduriaId: f.correduria_id, clienteId: f.cliente_id })),
    entrada.correduriaId,
    fichas,
  )
  if (ids.length === 0) return 0
  return db.$executeRaw(
    Prisma.sql`delete from portal_patrimonio_senal where correduria_id = ${entrada.correduriaId}::uuid and id = any(${ids}::uuid[])`,
  )
}
