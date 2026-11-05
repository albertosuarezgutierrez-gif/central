// Enlaces personalizados del portal del proveedor: TOKEN + ALCANCE + CADUCIDAD + REVOCACIÓN. PURO (solo node:crypto).
//
// · El token es 32 bytes aleatorios (256 bits) en base64url con un prefijo fijo (`pp_`). NO lleva el id del cliente ni del
//   documento: quien lo resuelve es la BD por su HASH (función SECURITY DEFINER de cada vertical).
// · En la BD solo se guarda `hashToken(token)` (SHA-256 hex). El token en claro existe en la respuesta que lo crea y en el
//   enlace que el cliente comparte; no se registra en logs ni se persiste.
// · Alcance = UN documento concreto (`documentoId`) y UN propósito (`pedido` | `factura`). Un enlace de pedido no sirve para
//   subir la factura y viceversa.
// · Toda causa de rechazo (no existe, caducado, revocado, cerrado, otro propósito, formato) se responde IGUAL hacia fuera
//   (`RESPUESTA_ENLACE_NO_VALIDO`): el motivo fino solo sirve para la pantalla interna del cliente.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const PROPOSITOS = ['pedido', 'factura'] as const
export type Proposito = (typeof PROPOSITOS)[number]
export const esProposito = (v: unknown): v is Proposito => typeof v === 'string' && (PROPOSITOS as readonly string[]).includes(v)

const PREFIJO = 'pp_'
const BYTES = 32
const TOKEN_RE = /^pp_[A-Za-z0-9_-]{43}$/

/** Token nuevo + su hash. `aleatorio` inyectable solo para tests deterministas. */
export function generarToken(aleatorio: (n: number) => Uint8Array = (n) => randomBytes(n)): { token: string; hash: string } {
  const b = aleatorio(BYTES)
  if (b.length !== BYTES) throw new Error('fuente aleatoria inválida')
  const token = PREFIJO + Buffer.from(b).toString('base64url')
  return { token, hash: hashToken(token) }
}

/** Formato válido (no consulta nada). Lo que no lo cumple se rechaza sin tocar la BD. */
export const formatoTokenValido = (t: unknown): t is string => typeof t === 'string' && TOKEN_RE.test(t)

/** SHA-256 hex del token. Es lo ÚNICO que se guarda y lo único que viaja a la BD. */
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex')

/** Comparación en tiempo constante de dos hashes hex (por si una vertical compara en memoria). */
export function mismoHash(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

// ─── Caducidad ───────────────────────────────────────────────────────────────
export const CADUCIDAD_MIN_DIAS = 1
export const CADUCIDAD_MAX_DIAS = 90
const DIA_MS = 86_400_000

/** Fecha de caducidad a partir de los días configurados por el cliente (acotados a [1, 90]; un valor raro no da un enlace eterno). */
export function calcularCaducidad(ahora: Date, dias: number): Date {
  const d = Number.isFinite(dias) ? Math.min(CADUCIDAD_MAX_DIAS, Math.max(CADUCIDAD_MIN_DIAS, Math.trunc(dias))) : CADUCIDAD_MIN_DIAS
  return new Date(ahora.getTime() + d * DIA_MS)
}

// ─── Evaluación del enlace guardado ──────────────────────────────────────────
export interface EnlaceGuardado {
  tokenHash: string
  proposito: Proposito
  documentoId: string
  caducaEn: Date
  revocadoEn: Date | null
  /** Cerrado por el flujo (p. ej. la factura ya se subió, o la recepción del pedido ya se verificó). */
  cerradoEn: Date | null
}
export type MotivoRechazo = 'formato' | 'no_existe' | 'hash' | 'caducado' | 'revocado' | 'cerrado' | 'alcance'
export type Evaluacion = { ok: true } | { ok: false; motivo: MotivoRechazo }

/**
 * ¿Sirve este enlace para ESTA petición? Defensa en profundidad: la BD ya filtra por hash/caducidad/alcance, y la app lo repite
 * sobre la fila que lee. `documentoId` esperado opcional (cuando la ruta ya lo sabe).
 */
export function evaluarEnlace(
  enlace: EnlaceGuardado | null,
  p: { token: unknown; proposito: Proposito; ahora: Date; documentoId?: string },
): Evaluacion {
  if (!formatoTokenValido(p.token)) return { ok: false, motivo: 'formato' }
  if (!enlace) return { ok: false, motivo: 'no_existe' }
  if (!mismoHash(hashToken(p.token), enlace.tokenHash)) return { ok: false, motivo: 'hash' }
  if (enlace.revocadoEn) return { ok: false, motivo: 'revocado' }
  if (enlace.cerradoEn) return { ok: false, motivo: 'cerrado' }
  if (enlace.caducaEn.getTime() <= p.ahora.getTime()) return { ok: false, motivo: 'caducado' }
  if (enlace.proposito !== p.proposito) return { ok: false, motivo: 'alcance' }
  if (p.documentoId !== undefined && enlace.documentoId !== p.documentoId) return { ok: false, motivo: 'alcance' }
  return { ok: true }
}

/** Respuesta pública ÚNICA para cualquier rechazo (no se distingue caducado de inexistente ni de IP bloqueada). */
export const RESPUESTA_ENLACE_NO_VALIDO = { status: 404, mensaje: 'Este enlace no es válido o ha caducado. Pide uno nuevo a quien te lo envió.' } as const

/** Quita el token de un texto (URL, mensaje de error) antes de registrarlo en un log. */
export const sinToken = (s: string): string => s.replace(/pp_[A-Za-z0-9_-]{20,}/g, 'pp_[oculto]')
