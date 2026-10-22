// PATRIMONIO (22/10/2026, paso 8) — adaptador con BD de los documentos de un inmueble/contrato/inquilino (ficheros en
// `bytea`, tabla `portal_patrimonio_documento`, SQL `2026-10-22_portal_patrimonio_documento.sql`).
//
// 🚨 Como `facturas-bd.ts`/`gastos-bd.ts`: parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`). El titular se
// resuelve aquí desde la ficha ya autorizada; el owner y el documento se buscan SIEMPRE con `titularId` en el `where` (id ajeno
// = 0 filas = 404) y la BD lo repite con FK compuestas `(x_id, titular_id)`. Las LISTAS no seleccionan `contenido`: solo la
// descarga lo lee. Sin DELETE: borrar es sellar `borrado_en`. El tope diario cuenta FILAS (también las borradas) de esta
// identidad en el día de Madrid; contar + insertar es UNA transacción con bloqueo asesor por identidad.
import type { Prisma } from '@prisma/client'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { OWNERS_DOCUMENTO, type OwnerDocumento } from './carpetas'
import { inicioDiaMadrid } from './dia-madrid'
import { MAX_DOCUMENTOS_DIA, type DocumentoMeta, type OwnerRef, type PuertosDocumentos } from './documentos-api'
import type { AccesosMapa } from './gastos-api'
import type { TipoFactura } from './tipo-fichero'

type Tx = Prisma.TransactionClient

/** Columna FK de cada owner. */
const COLUMNA: Record<OwnerDocumento, 'inmuebleId' | 'contratoId' | 'inquilinoId'> = { inmueble: 'inmuebleId', contrato: 'contratoId', inquilino: 'inquilinoId' }

/** Lo que se lee de una lista: SIN `contenido`. */
const SELECT_META = { id: true, carpeta: true, nombre: true, mime: true, sizeBytes: true, creadoEn: true, inmuebleId: true, contratoId: true, inquilinoId: true } as const
type FilaMeta = { id: string; carpeta: string; nombre: string; mime: string; sizeBytes: number; creadoEn: Date; inmuebleId: string | null; contratoId: string | null; inquilinoId: string | null }

const aMeta = (f: FilaMeta): DocumentoMeta => ({ id: f.id, carpeta: f.carpeta, nombre: f.nombre, mime: f.mime as TipoFactura, tamano: f.sizeBytes, creadoEn: f.creadoEn.toISOString() })
const ownerDe = (f: FilaMeta): OwnerRef | null =>
  f.inmuebleId ? { tipo: 'inmueble', id: f.inmuebleId } : f.contratoId ? { tipo: 'contrato', id: f.contratoId } : f.inquilinoId ? { tipo: 'inquilino', id: f.inquilinoId } : null

/** El titular de una ficha YA autorizada, sin crearlo (leer/listar/borrar no dan de alta nada). */
async function titularExistente(clienteId: string): Promise<{ id: string } | null> {
  const t = await prisma.portalPatrimonioTitular.findUnique({ where: { clienteId }, select: { id: true, archivadoEn: true } })
  return t && t.archivadoEn === null ? { id: t.id } : null
}

/**
 * Inserta el documento DENTRO de una transacción ya abierta (la usan `guardar` y la subida de facturas, que lo hace en la
 * misma reserva). No comprueba el tope: lo hace quien la llama con SU bloqueo. La BD exige un único owner del mismo titular.
 */
export async function crearDocumentoTx(
  tx: Tx,
  x: { titularId: string; identidadId: string; owner: OwnerRef; carpeta: string; nombre: string; mime: TipoFactura; sha256: string; contenido: Buffer },
): Promise<string> {
  const d = await tx.portalPatrimonioDocumento.create({
    data: {
      titularId: x.titularId,
      [COLUMNA[x.owner.tipo]]: x.owner.id,
      carpeta: x.carpeta,
      nombre: x.nombre,
      mime: x.mime,
      sizeBytes: x.contenido.length,
      sha256: x.sha256,
      contenido: x.contenido,
      creadoPorIdentidadId: x.identidadId,
    },
    select: { id: true },
  })
  return d.id
}

export function puertosDocumentos(identidadId: string, ahora: () => Date = () => new Date()): PuertosDocumentos {
  let cache: AccesosMapa | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId`.
  const sesionOk = async () => (await getIdentidad())?.id === identidadId

  async function titularDe(clienteId: string) {
    return (await sesionOk()) ? titularExistente(clienteId) : null
  }

  return {
    accesos,

    async ownerDelTitular(clienteId, owner) {
      const t = await titularDe(clienteId)
      if (!t || !(OWNERS_DOCUMENTO as readonly string[]).includes(owner.tipo)) return false
      const donde = { id: owner.id, titularId: t.id, archivadoEn: null }
      const fila =
        owner.tipo === 'inmueble'
          ? await prisma.portalPatrimonioInmueble.findFirst({ where: donde, select: { id: true } })
          : owner.tipo === 'contrato'
            ? await prisma.portalPatrimonioContrato.findFirst({ where: donde, select: { id: true } })
            : await prisma.portalPatrimonioInquilino.findFirst({ where: donde, select: { id: true } })
      return fila !== null
    },

    async guardar({ clienteId, owner, carpeta, nombre, mime, sha256, contenido }) {
      const t = await titularDe(clienteId)
      if (!t) return { ok: false, motivo: 'no_encontrado' }
      const ahoraD = ahora()
      // Un solo paso: sin el bloqueo, N subidas simultáneas leen el mismo recuento (< tope) y todas pasan.
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`portal-documento:${identidadId}`}, 0))`
        const hoy = await tx.portalPatrimonioDocumento.count({
          where: { creadoPorIdentidadId: identidadId, creadoEn: { gte: inicioDiaMadrid(ahoraD) } },
        })
        if (hoy >= MAX_DOCUMENTOS_DIA) return { ok: false as const, motivo: 'tope' as const }
        const id = await crearDocumentoTx(tx, { titularId: t.id, identidadId, owner, carpeta, nombre, mime, sha256, contenido })
        return { ok: true as const, id }
      })
    },

    async listar({ clienteId, owner, limite, desde }) {
      const t = await titularDe(clienteId)
      if (!t) return []
      const filas = await prisma.portalPatrimonioDocumento.findMany({
        where: { titularId: t.id, [COLUMNA[owner.tipo]]: owner.id, borradoEn: null },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: desde,
        take: limite + 1,
        select: SELECT_META,
      })
      return filas.map(aMeta)
    },

    async leer({ clienteId, documentoId, conContenido = true }) {
      const t = await titularDe(clienteId)
      if (!t) return null
      // Los bytes (hasta 10 MB) solo para la DESCARGA; decidir un borrado no los necesita.
      const f = await prisma.portalPatrimonioDocumento.findFirst({
        where: { id: documentoId, titularId: t.id, borradoEn: null },
        select: conContenido ? { ...SELECT_META, contenido: true } : SELECT_META,
      })
      const owner = f ? ownerDe(f) : null
      const bytes = f && 'contenido' in f && f.contenido ? Buffer.from(f.contenido as Uint8Array) : Buffer.alloc(0)
      return f && owner ? { meta: aMeta(f), owner, contenido: bytes } : null
    },

    async borrar({ clienteId, documentoId }) {
      const t = await titularDe(clienteId)
      if (!t) return 'no_encontrado'
      const r = await prisma.portalPatrimonioDocumento.updateMany({
        where: { id: documentoId, titularId: t.id, borradoEn: null },
        data: { borradoEn: new Date(), borradoPorIdentidadId: identidadId },
      })
      return r.count === 1 ? 'ok' : 'no_encontrado'
    },
  }
}
