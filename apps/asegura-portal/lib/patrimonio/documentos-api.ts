// PATRIMONIO (22/10/2026, paso 8) — lógica PURA (puertos inyectados, sin prisma ni sesión) de los documentos de un
// inmueble/contrato/inquilino: subir, listar, descargar y borrar (lógico). La BD real está en `documentos-bd.ts`
// (SQL `2026-10-22_portal_patrimonio_documento.sql`).
//
// 🚨 Como `facturas-api.ts`: el `titular` del formulario es una PETICIÓN, se busca DENTRO de los accesos resueltos por la
// cookie; el owner (inmueble/contrato/inquilino) y el documento se buscan DENTRO de ese titular. Ajeno, inexistente, borrado
// o sin nivel: la MISMA 404 `no_encontrado` (nunca 403). Los bytes mandan (`tipo-fichero.ts`), no el MIME del navegador.
// Sin DELETE físico: borrar es sellar `borrado_en`. La descarga NUNCA es una URL pública: pasa por la ruta del portal, que
// vuelve a comprobar acceso y rol, y responde `attachment` con un MIME de la lista cerrada.
import { createHash } from 'node:crypto'

import { validarSubida } from '@central/module-documental'

import { carpetaDeOwner, CARPETAS_POR_OWNER, esOwnerDocumento, puedeDocumento, type OwnerDocumento } from './carpetas.ts'
import type { AccesosMapa, Respuesta } from './gastos-api.ts'
import { tipoRealFactura, type TipoFactura } from './tipo-fichero.ts'

export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024
export const MAX_DOCUMENTOS_DIA = 40
export const MAX_DOCUMENTOS_LISTA = 50

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FicheroDocumento = { nombre: string; mime: string; tamano: number; contenido: Buffer }
export type DocumentoMeta = { id: string; carpeta: string; nombre: string; mime: TipoFactura; tamano: number; creadoEn: string }
export type OwnerRef = { tipo: OwnerDocumento; id: string }

export interface PuertosDocumentos {
  accesos(): Promise<AccesosMapa>
  /** ¿El inmueble/contrato/inquilino es de ESE titular (y no está archivado)? Se busca dentro del titular, nunca suelto. */
  ownerDelTitular(clienteId: string, owner: OwnerRef): Promise<boolean>
  /** ATÓMICO: cuenta los documentos de esta identidad en el día de Madrid y, si hay hueco, inserta la fila. */
  guardar(x: { clienteId: string; owner: OwnerRef; carpeta: string; nombre: string; mime: TipoFactura; tamano: number; sha256: string; contenido: Buffer }): Promise<{ ok: true; id: string } | { ok: false; motivo: 'tope' | 'no_encontrado' }>
  /** Sin `contenido`, sin borrados, más recientes primero. Pide `limite + 1` para saber si hay más. */
  listar(x: { clienteId: string; owner: OwnerRef; limite: number; desde: number }): Promise<DocumentoMeta[]>
  /** Solo un documento NO borrado DE ese titular. `conContenido: false` = sin los bytes (para decidir un borrado). */
  leer(x: { clienteId: string; documentoId: string; conContenido?: boolean }): Promise<{ meta: DocumentoMeta; owner: OwnerRef; contenido: Buffer } | null>
  /** Sella `borrado_en` (sin DELETE). Solo un documento no borrado de ese titular. */
  borrar(x: { clienteId: string; documentoId: string }): Promise<'ok' | 'no_encontrado'>
}

/**
 * Nombre mostrable: sin ruta, sin caracteres de control (C0/C1), sin marcas de dirección bidi (`factura‮fdp.exe` se
 * pintaría «factura.exe.pdf» al revés) ni separadores de línea Unicode, ≤120 caracteres contados por punto de código
 * (como `char_length` del CHECK; un `slice` por UTF-16 podría partir un emoji y dejar un sustituto suelto).
 */
export function nombreSeguro(v: string): string {
  const base = v.split(/[\\/]/).pop() ?? ''
  const t = base
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff"<>:*?|]/g, '')
    .replace(/\p{Cs}/gu, '') // sustitutos sueltos (con `u` un par bien formado es un solo punto de código)
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(t).slice(-120).join('').trim()
}

/** Extensión que corresponde al tipo REAL (la descarga la impone: un PDF nunca se guarda como `.html`). */
export const EXTENSION_DE: Readonly<Record<TipoFactura, string>> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

/** El nombre con la extensión de su tipo real: si ya la lleva (`.jpeg` vale para JPG) se deja; si no, se añade. */
export function nombreConExtension(nombre: string, mime: TipoFactura): string {
  const ext = EXTENSION_DE[mime]
  const actual = /\.[a-z0-9]{1,5}$/i.exec(nombre)?.[0].toLowerCase()
  if (actual === ext || (mime === 'image/jpeg' && actual === '.jpeg')) return nombre
  return `${nombre || 'documento'}${ext}`
}

function owner(tipo: unknown, id: unknown): OwnerRef | null {
  return esOwnerDocumento(tipo) && typeof id === 'string' && UUID.test(id) ? { tipo, id } : null
}
/** El titular pedido, SOLO si está en los accesos y su nivel permite la acción sobre alguna carpeta del owner. */
function titularCon(accesos: AccesosMapa, pedido: unknown, accion: 'ver' | 'subir' | 'borrar', o: OwnerDocumento): string | null {
  if (typeof pedido !== 'string' || !accesos.has(pedido)) return null
  return puedeDocumento(accesos.get(pedido), accion, o, CARPETAS_POR_OWNER[o][0].id) ? pedido : null
}

export async function responderSubidaDocumento(
  p: PuertosDocumentos,
  c: { titular: unknown; ownerTipo: unknown; ownerId: unknown; carpeta: unknown; fichero: FicheroDocumento | null },
): Promise<Respuesta> {
  const o = owner(c.ownerTipo, c.ownerId)
  if (!o) return NO_ENCONTRADO
  const clienteId = titularCon(await p.accesos(), c.titular, 'subir', o.tipo)
  if (clienteId === null || !(await p.ownerDelTitular(clienteId, o))) return NO_ENCONTRADO
  if (!carpetaDeOwner(o.tipo, c.carpeta)) return { status: 400, body: { error: 'datos_invalidos', campo: 'carpeta' } }
  const carpeta = c.carpeta as string
  // El permiso se mira sobre la carpeta PEDIDA (no solo la primera del owner): el inquilino solo sube a `recibos`.
  if (!puedeDocumento((await p.accesos()).get(clienteId), 'subir', o.tipo, carpeta)) return NO_ENCONTRADO
  if (!c.fichero) return { status: 400, body: { error: 'fichero_requerido' } }
  const tamano = Math.max(c.fichero.tamano, c.fichero.contenido.length)
  if (tamano > MAX_BYTES_DOCUMENTO) return { status: 413, body: { error: 'fichero_grande' } }
  const mime = tipoRealFactura(c.fichero.contenido)
  if (mime === null) return { status: 415, body: { error: 'formato_no_admitido' } }
  const nombre = nombreSeguro(c.fichero.nombre)
  try {
    // Validación del motor (carpeta del actor `gestor`, nombre no vacío, tamaño).
    validarSubida(new Map(Object.values(CARPETAS_POR_OWNER).flat().map((x) => [x.id, x])), 'gestor', { carpeta, nombre, tamano }, { tamanoMaxBytes: MAX_BYTES_DOCUMENTO })
  } catch {
    return { status: 400, body: { error: 'datos_invalidos', campo: 'fichero' } }
  }
  const sha256 = createHash('sha256').update(c.fichero.contenido).digest('hex')
  const r = await p.guardar({ clienteId, owner: o, carpeta, nombre, mime, tamano: c.fichero.contenido.length, sha256, contenido: c.fichero.contenido })
  if (!r.ok) return r.motivo === 'tope' ? { status: 429, body: { error: 'tope_diario' } } : NO_ENCONTRADO
  return { status: 201, body: { id: r.id, carpeta, nombre, mime } }
}

export async function responderListaDocumentos(p: PuertosDocumentos, c: { titular: unknown; ownerTipo: unknown; ownerId: unknown; desde?: unknown }): Promise<Respuesta> {
  const o = owner(c.ownerTipo, c.ownerId)
  if (!o) return NO_ENCONTRADO
  const clienteId = titularCon(await p.accesos(), c.titular, 'ver', o.tipo)
  if (clienteId === null || !(await p.ownerDelTitular(clienteId, o))) return NO_ENCONTRADO
  const desde = typeof c.desde === 'number' && Number.isInteger(c.desde) && c.desde >= 0 ? c.desde : 0
  const filas = await p.listar({ clienteId, owner: o, limite: MAX_DOCUMENTOS_LISTA, desde })
  return { status: 200, body: { documentos: filas.slice(0, MAX_DOCUMENTOS_LISTA), hayMas: filas.length > MAX_DOCUMENTOS_LISTA } }
}

export type RespuestaDescarga = Respuesta | { status: 200; fichero: { nombre: string; mime: TipoFactura; contenido: Buffer } }

export async function responderDescargaDocumento(p: PuertosDocumentos, c: { titular: unknown; documento: unknown }): Promise<RespuestaDescarga> {
  if (typeof c.documento !== 'string' || !UUID.test(c.documento) || typeof c.titular !== 'string') return NO_ENCONTRADO
  const accesos = await p.accesos()
  if (!accesos.has(c.titular)) return NO_ENCONTRADO
  const d = await p.leer({ clienteId: c.titular, documentoId: c.documento })
  if (!d) return NO_ENCONTRADO
  // Rol y carpeta del documento REAL (no de lo que diga la petición).
  if (!puedeDocumento(accesos.get(c.titular), 'ver', d.owner.tipo, d.meta.carpeta)) return NO_ENCONTRADO
  return { status: 200, fichero: { nombre: d.meta.nombre, mime: d.meta.mime, contenido: d.contenido } }
}

export async function responderBorrarDocumento(p: PuertosDocumentos, c: { titular: unknown; documento: unknown }): Promise<Respuesta> {
  if (typeof c.documento !== 'string' || !UUID.test(c.documento) || typeof c.titular !== 'string') return NO_ENCONTRADO
  const accesos = await p.accesos()
  if (!accesos.has(c.titular)) return NO_ENCONTRADO
  const d = await p.leer({ clienteId: c.titular, documentoId: c.documento, conContenido: false })
  if (!d || !puedeDocumento(accesos.get(c.titular), 'borrar', d.owner.tipo, d.meta.carpeta)) return NO_ENCONTRADO
  const r = await p.borrar({ clienteId: c.titular, documentoId: c.documento })
  return r === 'ok' ? { status: 200, body: { id: c.documento } } : NO_ENCONTRADO
}
