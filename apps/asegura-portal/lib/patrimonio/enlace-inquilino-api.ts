// P17 (26/10/2026) — lado del PROPIETARIO del enlace con el inquilino: lógica PURA (puertos inyectados, sin prisma ni sesión).
// `POST/GET /api/patrimonio/contratos/[id]/enlace-inquilino`, `DELETE …/enlace-inquilino/[enlaceId]` y
// `GET/POST …/recibos-compartidos`. La BD real está en `enlace-inquilino-bd.ts`.
//
// 🚨 Aislamiento: el contrato de la URL es una PETICIÓN; el puerto lo busca DENTRO de los titulares de `accesos()` (cookie +
// `portal_vinculo`). No está, o el nivel no es Total (`alta_baja`) → la MISMA 404 (nunca 403).
// 🚨 El portal NO ENVÍA NADA. Crea el enlace y devuelve el token UNA vez; lo copia o comparte el propietario. En BD solo queda el
// HASH del token (nunca el token). Ningún puerto de aquí tiene un canal de salida.
// 🚨 Un recibo solo se comparte si es un documento DE ese inquilino (el puerto lo comprueba y la FK compuesta lo repite).
import { randomBytes } from 'node:crypto'

import {
  BYTES_TOKEN_ENLACE_INQUILINO,
  MAX_ENLACES_INQUILINO_DIA,
  caducidadEnlaceInquilino,
  estadoEnlaceDeAcceso,
  normalizarContactoPropietario,
  puede,
  type EstadoEnlaceDeAcceso,
} from '@central/module-patrimonio'

import type { AccesosMapa, Respuesta } from './gastos-api.ts'

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

export type ContratoDelEnlace = { clienteId: string; contratoId: string; inquilinoIds: string[] }

export type FilaEnlace = {
  id: string
  inquilinoId: string
  creadoEn: Date
  caducaEn: Date | null
  anuladoEn: Date | null
  /** Acceso nacido de este enlace; `null` = nadie lo ha canjeado. */
  acceso: { id: string; aceptadoEn: Date; revocadoEn: Date | null; revocadoPor: string | null } | null
}

export type DocumentoCompartible = { id: string; inquilinoId: string; nombre: string; carpeta: string; creadoEn: Date; compartido: boolean }

export interface PuertosEnlaceInquilino {
  /** `accesosPatrimonio(identidad.id)`. */
  accesos(): Promise<AccesosMapa>
  ahora(): Date
  /** Solo busca dentro de `clientesIds`; inquilinos VIVOS del contrato. */
  contrato(id: string, clientesIds: readonly string[]): Promise<ContratoDelEnlace | null>
  /** Enlaces creados por esta identidad desde `desde` (tope diario). */
  creadosDesde(desde: Date): Promise<number>
  /** Anula los enlaces sin canjear de ese par y crea el nuevo (UNA transacción). Devuelve el id. */
  crearEnlace(x: { contratoId: string; inquilinoId: string; tokenHash: string; caducaEn: Date; contacto: string }): Promise<{ id: string }>
  listar(contratoId: string): Promise<FilaEnlace[]>
  /** Anula el enlace y, si ya se canjeó, revoca su acceso (`revocadoPor='propietario'`). `false` = no es de ese contrato. */
  retirar(x: { contratoId: string; enlaceId: string }): Promise<boolean>
  documentos(contratoId: string): Promise<DocumentoCompartible[]>
  /** `false` = el documento no es de un inquilino de ese contrato / ya no está. */
  compartir(x: { contratoId: string; inquilinoId: string; documentoId: string; compartir: boolean }): Promise<boolean>
  token(): string
  hashToken(token: string): string
}

/** Generador por defecto: 256 bits de `randomBytes`, nunca `Math.random`. */
export const generarTokenEnlace = (): string => randomBytes(BYTES_TOKEN_ENLACE_INQUILINO).toString('hex')

async function dentro(p: PuertosEnlaceInquilino, contratoId: unknown): Promise<ContratoDelEnlace | null> {
  const accesos = await p.accesos()
  if (accesos.size === 0 || typeof contratoId !== 'string' || !UUID.test(contratoId)) return null
  const c = await p.contrato(contratoId, [...accesos.keys()])
  if (!c || !accesos.has(c.clienteId)) return null
  // Solo Total: es regalar un acceso a un tercero.
  return puede(accesos.get(c.clienteId), 'alta_baja') ? c : null
}

export async function responderCrearEnlace(p: PuertosEnlaceInquilino, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const c = await dentro(p, contratoId)
  if (!c) return NO_ENCONTRADO
  const b = obj(cuerpo)
  const inquilinoId = typeof b.inquilinoId === 'string' && UUID.test(b.inquilinoId) ? b.inquilinoId : null
  // El inquilino se busca DENTRO de los del contrato: uno de otro contrato es la misma 404.
  if (inquilinoId === null || !c.inquilinoIds.includes(inquilinoId)) return NO_ENCONTRADO
  const contacto = normalizarContactoPropietario(b.contacto)
  if (contacto === null) return { status: 400, body: { error: 'datos_invalidos', campo: 'contacto' } }
  const ahora = p.ahora()
  if ((await p.creadosDesde(new Date(ahora.getTime() - 24 * 60 * 60 * 1000))) >= MAX_ENLACES_INQUILINO_DIA) {
    return { status: 429, body: { error: 'limite_diario' } }
  }
  const token = p.token()
  const r = await p.crearEnlace({
    contratoId: c.contratoId,
    inquilinoId,
    tokenHash: p.hashToken(token),
    caducaEn: caducidadEnlaceInquilino(ahora),
    contacto,
  })
  // El token sale UNA vez, en esta respuesta; la pantalla compone el enlace con su propio origen.
  return { status: 201, body: { id: r.id, token, caducaEn: caducidadEnlaceInquilino(ahora).toISOString() } }
}

export type EnlaceVista = {
  id: string
  inquilinoId: string
  estado: EstadoEnlaceDeAcceso | 'en_uso' | 'revocado'
  creadoEn: string
  caducaEn: string | null
  revocadoPor: string | null
}

export async function responderListarEnlaces(p: PuertosEnlaceInquilino, contratoId: unknown): Promise<Respuesta> {
  const c = await dentro(p, contratoId)
  if (!c) return NO_ENCONTRADO
  const ahora = p.ahora()
  const filas = await p.listar(c.contratoId)
  const enlaces: EnlaceVista[] = filas.map((f) => {
    const base = estadoEnlaceDeAcceso({ anuladoEn: f.anuladoEn, caducaEn: f.caducaEn, usado: f.acceso !== null }, ahora)
    const estado: EnlaceVista['estado'] = f.acceso === null ? base : f.acceso.revocadoEn === null ? 'en_uso' : 'revocado'
    return {
      id: f.id,
      inquilinoId: f.inquilinoId,
      estado,
      creadoEn: f.creadoEn.toISOString(),
      caducaEn: f.caducaEn?.toISOString() ?? null,
      revocadoPor: f.acceso?.revocadoPor ?? null,
    }
  })
  return { status: 200, body: { enlaces } }
}

export async function responderRetirarEnlace(p: PuertosEnlaceInquilino, contratoId: unknown, enlaceId: unknown): Promise<Respuesta> {
  const c = await dentro(p, contratoId)
  if (!c || typeof enlaceId !== 'string' || !UUID.test(enlaceId)) return NO_ENCONTRADO
  return (await p.retirar({ contratoId: c.contratoId, enlaceId })) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
}

export async function responderListarRecibos(p: PuertosEnlaceInquilino, contratoId: unknown): Promise<Respuesta> {
  const c = await dentro(p, contratoId)
  if (!c) return NO_ENCONTRADO
  const docs = await p.documentos(c.contratoId)
  return {
    status: 200,
    body: {
      documentos: docs
        .filter((d) => c.inquilinoIds.includes(d.inquilinoId))
        .map((d) => ({ id: d.id, inquilinoId: d.inquilinoId, nombre: d.nombre, carpeta: d.carpeta, creadoEn: d.creadoEn.toISOString(), compartido: d.compartido })),
    },
  }
}

export async function responderCompartirRecibo(p: PuertosEnlaceInquilino, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const c = await dentro(p, contratoId)
  if (!c) return NO_ENCONTRADO
  const b = obj(cuerpo)
  const documentoId = typeof b.documentoId === 'string' && UUID.test(b.documentoId) ? b.documentoId : null
  if (documentoId === null || typeof b.compartir !== 'boolean') return { status: 400, body: { error: 'datos_invalidos', campo: documentoId === null ? 'documentoId' : 'compartir' } }
  // El documento se busca DENTRO de los de este contrato; de ahí sale su inquilino (nunca del cuerpo).
  const doc = (await p.documentos(c.contratoId)).find((d) => d.id === documentoId && c.inquilinoIds.includes(d.inquilinoId))
  if (!doc) return NO_ENCONTRADO
  const ok = await p.compartir({ contratoId: c.contratoId, inquilinoId: doc.inquilinoId, documentoId, compartir: b.compartir })
  return ok ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
}
