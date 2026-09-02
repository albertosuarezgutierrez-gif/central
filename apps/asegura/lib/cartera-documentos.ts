// Documentos de la correduría sobre `seguros.documentos` (tabla PROPIA, 02/09/2026).
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - `correduriaId` SIEMPRE explícito, y el DESTINO (cliente / póliza / siniestro)
//   se comprueba que pertenece a esa correduría ANTES de escribir: con
//   BYPASSRLS, un id de otra correduría no da error — da los datos de otro.
// - Las lecturas devuelven `null` cuando la consulta falla. NUNCA `[]`: eso
//   diría «no tiene documentos», que es justo la mentira que esta tabla viene
//   a evitar (CLAUDE.md: dato que NO hay ≠ dato que NO se ha mirado).
// - El fichero vive en `contenido` (bytea). Las listas NO lo cargan; solo
//   `leerDocumento()` lo trae, y de uno en uno.
// - `pedido` = existe la fila pero no el fichero. Es lo que distingue «no se lo
//   he pedido» de «se lo pedí y no lo ha mandado».

import { createHash } from 'node:crypto'
import {
  estadoDocumento,
  revisarDocumento,
  tipoDocumento,
  type DocumentoResumen,
  type TipoDocumento,
} from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export type Destino = { clienteId?: string | null; polizaId?: string | null; siniestroId?: string | null }

/**
 * Comprueba que el destino existe Y es de esta correduría, y completa lo que
 * se deduce (la póliza dice su cliente; el siniestro, su póliza y su cliente).
 * Devuelve `null` si algo no cuadra: entonces NO se escribe.
 */
export async function resolverDestino(
  correduriaId: string,
  d: Destino,
): Promise<{ clienteId: string | null; polizaId: string | null; siniestroId: string | null } | null> {
  const db = prismaAsegura()
  let clienteId = d.clienteId ?? null
  let polizaId = d.polizaId ?? null
  const siniestroId = d.siniestroId ?? null

  if (siniestroId) {
    const s = await db.siniestro.findFirst({ where: { id: siniestroId, correduriaId }, select: { clienteId: true, polizaId: true } })
    if (!s) return null
    polizaId = polizaId ?? s.polizaId
    clienteId = clienteId ?? s.clienteId
  }
  if (polizaId) {
    const p = await db.poliza.findFirst({ where: { id: polizaId, correduriaId }, select: { clienteId: true } })
    if (!p) return null
    clienteId = clienteId ?? p.clienteId
  }
  if (clienteId) {
    const c = await db.cliente.findFirst({ where: { id: clienteId, correduriaId }, select: { id: true } })
    if (!c) return null
  }
  if (!clienteId && !polizaId && !siniestroId) return null
  return { clienteId, polizaId, siniestroId }
}

const SELECT_RESUMEN = {
  id: true,
  tipo: true,
  estado: true,
  nombreFichero: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  notas: true,
  subidoPor: true,
  clienteId: true,
  polizaId: true,
  siniestroId: true,
  createdAt: true,
  revisadoAt: true,
} as const

type FilaResumen = {
  id: string
  tipo: string
  estado: string
  nombreFichero: string | null
  mimeType: string | null
  sizeBytes: number | null
  sha256: string | null
  notas: string | null
  subidoPor: string
  clienteId: string | null
  polizaId: string | null
  siniestroId: string | null
  createdAt: Date
  revisadoAt: Date | null
}

function aResumen(f: FilaResumen): DocumentoResumen {
  return {
    id: f.id,
    tipo: tipoDocumento(f.tipo),
    estado: estadoDocumento(f.estado),
    nombre: f.nombreFichero,
    mime: f.mimeType,
    bytes: f.sizeBytes,
    sha256: f.sha256,
    notas: f.notas,
    subidoPor: f.subidoPor === 'cliente' || f.subidoPor === 'agente' ? f.subidoPor : 'corredor',
    clienteId: f.clienteId,
    polizaId: f.polizaId,
    siniestroId: f.siniestroId,
    creado: f.createdAt.toISOString(),
    revisadoEn: f.revisadoAt ? f.revisadoAt.toISOString() : null,
  }
}

/**
 * Los documentos de un cliente / póliza / siniestro. Por cliente salen TODOS
 * los suyos (también los colgados de sus pólizas y siniestros): la ficha es un
 * índice, no un cajón por tabla.
 *
 * `null` = no se ha podido consultar. NO es «no tiene».
 */
export async function listarDocumentos(
  correduriaId: string,
  d: Destino,
): Promise<DocumentoResumen[] | null> {
  if (!aseguraConfigurada()) return null
  try {
    const db = prismaAsegura()
    const or: Record<string, string>[] = []
    if (d.clienteId) or.push({ clienteId: d.clienteId })
    if (d.polizaId) or.push({ polizaId: d.polizaId })
    if (d.siniestroId) or.push({ siniestroId: d.siniestroId })
    if (or.length === 0) return []
    const filas = await db.documento.findMany({
      where: { correduriaId, OR: or },
      select: SELECT_RESUMEN,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return filas.map(aResumen)
  } catch {
    return null
  }
}

/** Cuántos documentos tiene una póliza (los propios + los de la tabla vieja del CRM). `null` si no se pudo contar. */
export async function contarDocumentosPoliza(correduriaId: string, polizaId: string): Promise<number | null> {
  try {
    const db = prismaAsegura()
    const [nuevos, viejos] = await Promise.all([
      db.documento.count({ where: { correduriaId, polizaId, estado: { not: 'pedido' } } }),
      db.$queryRaw<{ n: bigint }[]>`select count(*)::bigint as n from poliza_documentos where poliza_id = ${polizaId}::uuid`,
    ])
    return nuevos + Number(viejos[0]?.n ?? 0)
  } catch {
    return null
  }
}

export type Guardado =
  | { ok: true; documento: DocumentoResumen; repetido: boolean }
  | { ok: false; motivo: string; status: 400 | 404 | 415 | 500 }

/**
 * Guarda un fichero. Devuelve `repetido: true` si ya había uno con el mismo
 * sha256 colgado del mismo cliente (se guarda igual: puede ser otra póliza).
 */
export async function guardarDocumento(
  correduriaId: string,
  entrada: Destino & {
    tipo: TipoDocumento
    nombre: string
    mime: string
    contenido: Buffer
    notas?: string | null
    subidoPor?: 'corredor' | 'cliente' | 'agente'
  },
): Promise<Guardado> {
  const reparo = revisarDocumento({ type: entrada.mime, size: entrada.contenido.length, name: entrada.nombre })
  if (reparo) return { ok: false, motivo: reparo, status: 415 }
  const destino = await resolverDestino(correduriaId, entrada)
  if (!destino) return { ok: false, motivo: 'El cliente, la póliza o el siniestro no existe en esta correduría.', status: 404 }
  try {
    const db = prismaAsegura()
    const sha256 = createHash('sha256').update(entrada.contenido).digest('hex')
    const repetido =
      destino.clienteId !== null &&
      (await db.documento.count({ where: { correduriaId, clienteId: destino.clienteId, sha256 } })) > 0
    const fila = await db.documento.create({
      data: {
        correduriaId,
        ...destino,
        tipo: entrada.tipo,
        estado: 'recibido',
        nombreFichero: entrada.nombre.slice(0, 255),
        mimeType: entrada.mime || 'application/octet-stream',
        sizeBytes: entrada.contenido.length,
        sha256,
        contenido: entrada.contenido,
        notas: entrada.notas?.trim() || null,
        subidoPor: entrada.subidoPor ?? 'corredor',
      },
      select: SELECT_RESUMEN,
    })
    return { ok: true, documento: aResumen(fila), repetido }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Deja constancia de que se ha PEDIDO un documento que aún no ha llegado. */
export async function pedirDocumento(
  correduriaId: string,
  entrada: Destino & { tipo: TipoDocumento; notas?: string | null },
): Promise<Guardado> {
  const destino = await resolverDestino(correduriaId, entrada)
  if (!destino) return { ok: false, motivo: 'El cliente, la póliza o el siniestro no existe en esta correduría.', status: 404 }
  try {
    const fila = await prismaAsegura().documento.create({
      data: { correduriaId, ...destino, tipo: entrada.tipo, estado: 'pedido', notas: entrada.notas?.trim() || null },
      select: SELECT_RESUMEN,
    })
    return { ok: true, documento: aResumen(fila), repetido: false }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Marca como revisado. `false` si no existe (o no es de esta correduría) o está `pedido`. */
export async function marcarRevisado(correduriaId: string, id: string, por: string): Promise<boolean> {
  try {
    const r = await prismaAsegura().documento.updateMany({
      where: { id, correduriaId, estado: 'recibido' },
      data: { estado: 'revisado', revisadoAt: new Date(), revisadoPor: por.slice(0, 100) },
    })
    return r.count > 0
  } catch {
    return false
  }
}

/** Borra un documento (el corredor se ha equivocado de ficha). `false` si no existe. */
export async function borrarDocumento(correduriaId: string, id: string): Promise<boolean> {
  try {
    const r = await prismaAsegura().documento.deleteMany({ where: { id, correduriaId } })
    return r.count > 0
  } catch {
    return false
  }
}

/** El fichero entero, de uno en uno. `null` si no existe, no es de esta correduría o está `pedido`. */
export async function leerDocumento(
  correduriaId: string,
  id: string,
): Promise<{ nombre: string; mime: string; contenido: Buffer } | null> {
  try {
    const f = await prismaAsegura().documento.findFirst({
      where: { id, correduriaId },
      select: { nombreFichero: true, mimeType: true, contenido: true },
    })
    if (!f || !f.contenido) return null
    return {
      nombre: f.nombreFichero ?? 'documento',
      mime: f.mimeType ?? 'application/octet-stream',
      contenido: Buffer.from(f.contenido),
    }
  } catch {
    return null
  }
}
