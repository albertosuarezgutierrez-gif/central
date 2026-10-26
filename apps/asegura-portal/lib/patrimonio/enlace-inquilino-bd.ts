// P17 (26/10/2026) — adaptador con BD del lado del PROPIETARIO del enlace con el inquilino (puertos de `enlace-inquilino-api.ts`).
// SQL: `2026-10-26_portal_patrimonio_inquilino_acceso.sql`.
//
// 🚨 Como `contratos-bd.ts`: TODO parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`). El contrato de la URL se busca
// DENTRO de los titulares autorizados; el inquilino y el documento se buscan DENTRO del contrato ya resuelto, y la BD lo repite con FK
// compuestas. Sin DELETE: anular y retirar son sellos. En BD solo se guarda el HASH del token (`hashCanal`, misma pimienta que el resto).
// El portal no tiene ningún canal de salida aquí: no se envía nada.
import { generarTokenEnlace, type PuertosEnlaceInquilino } from './enlace-inquilino-api.ts'
import { hashCanal } from '../auth'
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'

/** El `where` del contrato pedido DENTRO de los titulares autorizados (y sin archivar). */
const contratoDentro = (id: string, clientesIds: readonly string[]) => ({
  id,
  archivadoEn: null,
  inmueble: { archivadoEn: null, titular: { clienteId: { in: [...clientesIds] }, archivadoEn: null } },
})

/** Documentos que NO se pueden compartir con el inquilino: su propia identificación. */
const CARPETA_NO_COMPARTIBLE = 'identificacion'

export function puertosEnlaceInquilino(identidadId: string, ahora: () => Date = () => new Date()): PuertosEnlaceInquilino {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId`.
  const sesionOk = async () => (await getIdentidad())?.id === identidadId

  /** Titular del contrato YA autorizado (se vuelve a buscar con el contrato dentro de los accesos). */
  async function titularDe(contratoId: string): Promise<string | null> {
    const ids = [...(await accesos()).keys()]
    if (ids.length === 0 || !(await sesionOk())) return null
    const c = await prisma.portalPatrimonioContrato.findFirst({ where: contratoDentro(contratoId, ids), select: { titularId: true } })
    return c?.titularId ?? null
  }

  async function inquilinosDe(contratoId: string, titularId: string): Promise<string[]> {
    const filas = await prisma.portalPatrimonioContratoInquilino.findMany({
      where: { contratoId, titularId, archivadoEn: null },
      select: { inquilinoId: true },
    })
    return filas.map((f) => f.inquilinoId)
  }

  return {
    accesos,
    ahora,
    token: generarTokenEnlace,
    hashToken: hashCanal,

    async contrato(id, clientesIds) {
      if (!(await sesionOk()) || clientesIds.length === 0) return null
      const f = await prisma.portalPatrimonioContrato.findFirst({
        where: contratoDentro(id, clientesIds),
        select: {
          id: true,
          titularId: true,
          inmueble: { select: { titular: { select: { clienteId: true } } } },
        },
      })
      if (!f) return null
      return { clienteId: f.inmueble.titular.clienteId, contratoId: f.id, inquilinoIds: await inquilinosDe(f.id, f.titularId) }
    },

    async creadosDesde(desde) {
      return prisma.portalPatrimonioEnlaceInquilino.count({ where: { creadoPorIdentidadId: identidadId, creadoEn: { gte: desde } } })
    },

    async crearEnlace({ contratoId, inquilinoId, tokenHash, caducaEn, contacto }) {
      const t = await titularDe(contratoId)
      if (!t) throw new Error('contrato_no_autorizado')
      return prisma.$transaction(async (tx) => {
        // Un solo enlace sin canjear por par: el nuevo anula al anterior (si no, quedarían llaves sueltas en un chat).
        const canjeados = await tx.portalPatrimonioInquilinoAcceso.findMany({ where: { contratoId, inquilinoId }, select: { enlaceId: true } })
        await tx.portalPatrimonioEnlaceInquilino.updateMany({
          where: { contratoId, inquilinoId, anuladoEn: null, id: { notIn: canjeados.map((c) => c.enlaceId) } },
          data: { anuladoEn: ahora() },
        })
        const e = await tx.portalPatrimonioEnlaceInquilino.create({
          data: { contratoId, inquilinoId, tokenHash, caducaEn, contactoNombre: contacto, creadoPorIdentidadId: identidadId },
          select: { id: true },
        })
        return { id: e.id }
      })
    },

    async listar(contratoId) {
      const t = await titularDe(contratoId)
      if (!t) return []
      const enlaces = await prisma.portalPatrimonioEnlaceInquilino.findMany({
        where: { contratoId },
        orderBy: { creadoEn: 'desc' },
        take: 50,
        select: { id: true, inquilinoId: true, creadoEn: true, caducaEn: true, anuladoEn: true },
      })
      const accesosDe = await prisma.portalPatrimonioInquilinoAcceso.findMany({
        where: { contratoId, enlaceId: { in: enlaces.map((e) => e.id) } },
        select: { id: true, enlaceId: true, aceptadoEn: true, revocadoEn: true, revocadoPor: true },
      })
      const porEnlace = new Map(accesosDe.map((a) => [a.enlaceId, a]))
      return enlaces.map((e) => {
        const a = porEnlace.get(e.id)
        return { ...e, acceso: a ? { id: a.id, aceptadoEn: a.aceptadoEn, revocadoEn: a.revocadoEn, revocadoPor: a.revocadoPor } : null }
      })
    },

    async retirar({ contratoId, enlaceId }) {
      const t = await titularDe(contratoId)
      if (!t) return false
      const e = await prisma.portalPatrimonioEnlaceInquilino.findFirst({ where: { id: enlaceId, contratoId }, select: { id: true } })
      if (!e) return false
      const ya = ahora()
      await prisma.$transaction([
        prisma.portalPatrimonioEnlaceInquilino.updateMany({ where: { id: e.id, contratoId, anuladoEn: null }, data: { anuladoEn: ya } }),
        prisma.portalPatrimonioInquilinoAcceso.updateMany({
          where: { enlaceId: e.id, contratoId, revocadoEn: null },
          data: { revocadoEn: ya, revocadoPor: 'propietario' },
        }),
      ])
      return true
    },

    async documentos(contratoId) {
      const titularId = await titularDe(contratoId)
      if (!titularId) return []
      const inquilinoIds = await inquilinosDe(contratoId, titularId)
      if (inquilinoIds.length === 0) return []
      const docs = await prisma.portalPatrimonioDocumento.findMany({
        where: { titularId, inquilinoId: { in: inquilinoIds }, borradoEn: null, carpeta: { not: CARPETA_NO_COMPARTIBLE } },
        orderBy: { creadoEn: 'desc' },
        take: 100,
        // 🚨 Sin `contenido`: una lista no lee el fichero.
        select: { id: true, inquilinoId: true, nombre: true, carpeta: true, creadoEn: true },
      })
      const compartidos = await prisma.portalPatrimonioReciboCompartido.findMany({
        where: { contratoId, titularId, retiradoEn: null, documentoId: { in: docs.map((d) => d.id) } },
        select: { documentoId: true },
      })
      const set = new Set(compartidos.map((c) => c.documentoId))
      return docs.flatMap((d) => (d.inquilinoId === null ? [] : [{ id: d.id, inquilinoId: d.inquilinoId, nombre: d.nombre, carpeta: d.carpeta, creadoEn: d.creadoEn, compartido: set.has(d.id) }]))
    },

    async compartir({ contratoId, inquilinoId, documentoId, compartir }) {
      const titularId = await titularDe(contratoId)
      if (!titularId) return false
      if (!compartir) {
        await prisma.portalPatrimonioReciboCompartido.updateMany({
          where: { contratoId, titularId, inquilinoId, documentoId, retiradoEn: null },
          data: { retiradoEn: ahora() },
        })
        return true
      }
      const doc = await prisma.portalPatrimonioDocumento.findFirst({
        where: { id: documentoId, titularId, inquilinoId, borradoEn: null, carpeta: { not: CARPETA_NO_COMPARTIBLE } },
        select: { id: true },
      })
      if (!doc) return false
      const viva = await prisma.portalPatrimonioReciboCompartido.findFirst({
        where: { contratoId, titularId, inquilinoId, documentoId, retiradoEn: null },
        select: { id: true },
      })
      if (viva) return true
      await prisma.portalPatrimonioReciboCompartido.create({
        data: { titularId, contratoId, inquilinoId, documentoId, compartidoPorIdentidadId: identidadId },
      })
      return true
    },
  }
}
