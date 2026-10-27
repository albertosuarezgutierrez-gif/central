// RECOMENDACIÓN ENTRE PROPIETARIOS (27/10/2026) — adaptador con BD de `recomendacion-api.ts` y el CANJE. SQL:
// `2026-10-27_portal_patrimonio_recomendacion.sql`.
//
// 🚨 Como el resto de patrimonio: TODO parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`) y toda consulta lleva
// `recomendadorIdentidadId: identidadId` (o `canjeadaPorIdentidadId`): la identidad SIEMPRE sale de la cookie, nunca del cuerpo.
// En BD solo queda el HASH del correo (`hashCanal`). No hay canal de salida: el portal no envía nada a nadie. Sin DELETE: anular y
// canjear son sellos.
import { puedeCanjearRecomendacion, recompensaRecomendacionVigente } from '@central/module-patrimonio'

import { hashCanal } from '../auth'
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import type { PuertosRecomendacion } from './recomendacion-api.ts'

export function puertosRecomendacion(identidadId: string, ahora: () => Date = () => new Date()): PuertosRecomendacion {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId`.
  const sesionOk = async () => (await getIdentidad())?.id === identidadId

  return {
    accesos,
    ahora,
    hashCorreo: hashCanal,

    async esMiCorreo(correoHash) {
      if (!(await sesionOk())) return true // fail-closed: sin sesión no se crea nada
      const c = await prisma.portalCanal.findFirst({ where: { identidadId, tipo: 'email', valorHash: correoHash }, select: { id: true } })
      return c !== null
    },

    async creadasDesde(desde) {
      return prisma.portalPatrimonioRecomendacion.count({ where: { recomendadorIdentidadId: identidadId, creadoEn: { gte: desde } } })
    },

    async crear({ correoHash, caducaEn }) {
      if (!(await sesionOk()) || (await accesos()).size === 0) throw new Error('sin_acceso')
      return prisma.$transaction(async (tx) => {
        const ya = ahora()
        // Una viva por par: la ya caducada se anula antes para poder volver a invitar al mismo correo.
        await tx.portalPatrimonioRecomendacion.updateMany({
          where: { recomendadorIdentidadId: identidadId, correoHash, anuladoEn: null, canjeadaEn: null, caducaEn: { lte: ya } },
          data: { anuladoEn: ya },
        })
        const viva = await tx.portalPatrimonioRecomendacion.findFirst({
          where: { recomendadorIdentidadId: identidadId, correoHash, anuladoEn: null, canjeadaEn: null },
          select: { id: true },
        })
        if (viva) return { id: viva.id, repetida: true }
        const f = await tx.portalPatrimonioRecomendacion.create({
          data: { recomendadorIdentidadId: identidadId, correoHash, caducaEn },
          select: { id: true },
        })
        return { id: f.id, repetida: false }
      })
    },

    async listar() {
      if (!(await sesionOk())) return []
      const filas = await prisma.portalPatrimonioRecomendacion.findMany({
        where: { recomendadorIdentidadId: identidadId },
        orderBy: { creadoEn: 'desc' },
        take: 50,
        // 🚨 Sin `correoHash` ni `canjeadaPorIdentidadId`: la lista no dice a quién se invitó.
        select: { id: true, creadoEn: true, caducaEn: true, anuladoEn: true, canjeadaEn: true },
      })
      return filas.map((f) => ({ id: f.id, creadaEn: f.creadoEn, caducaEn: f.caducaEn, anuladaEn: f.anuladoEn, canjeadaEn: f.canjeadaEn }))
    },

    async anular(id) {
      if (!(await sesionOk())) return false
      const r = await prisma.portalPatrimonioRecomendacion.updateMany({
        where: { id, recomendadorIdentidadId: identidadId, anuladoEn: null, canjeadaEn: null },
        data: { anuladoEn: ahora() },
      })
      return r.count > 0
    },

    async canjes() {
      return canjesDeIdentidad(identidadId)
    },
  }
}

/** Fechas de canje de las recomendaciones de ESTA identidad (como quien recomendó o como invitada). Lanza si la BD falla. */
async function canjesDeIdentidad(identidadId: string): Promise<Array<Date | null>> {
  if ((await getIdentidad())?.id !== identidadId) return []
  const filas = await prisma.portalPatrimonioRecomendacion.findMany({
    where: { canjeadaEn: { not: null }, OR: [{ recomendadorIdentidadId: identidadId }, { canjeadaPorIdentidadId: identidadId }] },
    select: { canjeadaEn: true },
    take: 100,
  })
  return filas.map((f) => f.canjeadaEn)
}

/**
 * ¿Tiene ESTA identidad una recompensa de recomendación viva? Para el cupo de IA (`valorClienteDeIdentidad`). Un fallo de lectura
 * es «sin recompensa» (conservador: nunca se regala cupo por no poder comprobar).
 */
export async function recompensaVigenteDeIdentidad(identidadId: string, hoy: Date = new Date()): Promise<boolean> {
  try {
    return recompensaRecomendacionVigente(await canjesDeIdentidad(identidadId), hoy)
  } catch (e) {
    console.error('[portal/patrimonio] recompensa de recomendación sin comprobar (sin recompensa):', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * EL CANJE: el invitado se ha dado de alta (identidad NUEVA, posterior a la recomendación), su correo verificado coincide con el
 * hash de una recomendación pendiente y ya tiene patrimonio activo (`accesosPatrimonio`). Entonces la recomendación se sella y los
 * DOS ganan el cupo «amplio» 90 días (`recompensaVigente`). Idempotente; una sola recompensa por invitado (índice único); nunca
 * lanza. Lo llama la página de patrimonio del propio invitado. Devuelve cuántas canjeó (0 o 1).
 */
export async function canjearRecomendaciones(identidadId: string, hoy: Date = new Date()): Promise<number> {
  try {
    if ((await getIdentidad())?.id !== identidadId) return 0
    if ((await accesosPatrimonio(identidadId)).size === 0) return 0
    const [yo, canales] = await Promise.all([
      prisma.portalIdentidad.findUnique({ where: { id: identidadId }, select: { creadaEn: true } }),
      prisma.portalCanal.findMany({ where: { identidadId, tipo: 'email', verificadoEn: { not: null } }, select: { valorHash: true } }),
    ])
    if (!yo || canales.length === 0) return 0
    const pendientes = await prisma.portalPatrimonioRecomendacion.findMany({
      where: { correoHash: { in: canales.map((c) => c.valorHash) }, anuladoEn: null, canjeadaEn: null, caducaEn: { gt: hoy }, recomendadorIdentidadId: { not: identidadId } },
      orderBy: { creadoEn: 'asc' },
      take: 20,
      select: { id: true, recomendadorIdentidadId: true, creadoEn: true, caducaEn: true, anuladoEn: true, canjeadaEn: true },
    })
    const elegida = pendientes.find((r) =>
      puedeCanjearRecomendacion(
        { recomendadorIdentidadId: r.recomendadorIdentidadId, creadaEn: r.creadoEn, caducaEn: r.caducaEn, anuladaEn: r.anuladoEn, canjeadaEn: r.canjeadaEn },
        { identidadId, creadaEn: yo.creadaEn },
        hoy,
      ),
    )
    if (!elegida) return 0
    const r = await prisma.portalPatrimonioRecomendacion.updateMany({
      where: { id: elegida.id, canjeadaEn: null, anuladoEn: null },
      data: { canjeadaPorIdentidadId: identidadId, canjeadaEn: hoy },
    })
    return r.count
  } catch (e) {
    // P2002 (ya dio una recompensa) o BD sin migrar: no se canjea y la página sigue.
    console.error('[portal/patrimonio] canje de recomendación no hecho:', e instanceof Error ? e.message : e)
    return 0
  }
}
