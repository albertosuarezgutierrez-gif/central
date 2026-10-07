// Sesión MANUAL del tarificador RPA, lado asegura — reglas PURAS (07/10/2026). Ver tarificador-sesion.ts, la ruta
// app/api/tarificador/sesion/[compania]/route.ts y services/tarificador-rpa/src/sesion-manual.ts (el cliente).
//
// 🔒 El token es OPACO: asegura no tiene la clave y no lo abre. Aquí solo se valida su FORMA y su TAMAÑO.
//    Ningún mensaje de error ni log lleva el token (ni un trozo).

import { TELEFONOS_COMPANIAS } from '@central/module-seguros'
import { esTablaAusente } from './pg-error.ts'

export const SQL_SESIONES = 'apps/asegura/prisma/sql/2026-10-07e_tarificador_sesiones.sql'
export const MENSAJE_SIN_ACTIVAR = `sesion_sin_activar: aplica el SQL ${SQL_SESIONES} en la base`

/** Slugs de compañía admitidos: el catálogo de compañías de `@central/module-seguros` (mapfre, allianz, generali…). */
export const COMPANIAS_SESION: ReadonlySet<string> = new Set(TELEFONOS_COMPANIAS.map((c) => c.slug))

/** Tope del token (caracteres base64url ≈ 750 KB de storageState sellado). El mismo número que el CHECK del SQL. */
export const MAX_TOKEN_CHARS = 1_000_000
/** Tope del cuerpo del PUT: token + JSON. Por encima, 413 sin parsear. */
export const MAX_CUERPO_BYTES = MAX_TOKEN_CHARS + 4_096
/** Techo de caducidad que acepta asegura: el del worker (24 h) + 1 h de holgura por desfase de reloj. */
export const MAX_CADUCIDAD_MS = 25 * 3_600_000

const SLUG = /^[a-z0-9-]{1,40}$/
/** `v1.<iv base64url>.<cifrado+tag base64url>` (boveda-sesion.ts). */
const TOKEN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,}$/

export type Lectura<T> = { ok: true; valor: T } | { ok: false; status: 400 | 413; motivo: string }

/** Compañía del segmento de la URL: minúsculas, slug, y en la lista blanca. */
export function leerCompania(raw: unknown): Lectura<string> {
  let s: string
  try {
    s = decodeURIComponent(String(raw ?? '')).trim().toLowerCase()
  } catch {
    return { ok: false, status: 400, motivo: 'compania_invalida' }
  }
  if (!SLUG.test(s)) return { ok: false, status: 400, motivo: 'compania_invalida' }
  if (!COMPANIAS_SESION.has(s)) return { ok: false, status: 400, motivo: 'compania_desconocida' }
  return { ok: true, valor: s }
}

/** ¿El Content-Length anunciado ya pasa del tope? (Sin cabecera o ilegible: se decide tras leer.) */
export function cuerpoExcedeTope(contentLength: string | null): boolean {
  if (contentLength === null) return false
  const n = Number(contentLength)
  return Number.isFinite(n) && n > MAX_CUERPO_BYTES
}

export type Guardado = { token: string; caducaEn: Date }

/** Cuerpo del PUT `{ token, caducaEn }` (lo que manda `almacenHttp().guardar`). */
export function leerGuardado(texto: string, ahora: number): Lectura<Guardado> {
  if (texto.length > MAX_CUERPO_BYTES) return { ok: false, status: 413, motivo: 'cuerpo_grande' }
  let body: unknown
  try {
    body = JSON.parse(texto)
  } catch {
    return { ok: false, status: 400, motivo: 'json_invalido' }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, status: 400, motivo: 'json_invalido' }
  const b = body as { token?: unknown; caducaEn?: unknown }
  if (typeof b.token !== 'string' || !b.token) return { ok: false, status: 400, motivo: 'token_ausente' }
  if (b.token.length > MAX_TOKEN_CHARS) return { ok: false, status: 413, motivo: 'token_grande' }
  if (!TOKEN.test(b.token)) return { ok: false, status: 400, motivo: 'token_formato' }
  if (typeof b.caducaEn !== 'string') return { ok: false, status: 400, motivo: 'caduca_invalida' }
  const t = Date.parse(b.caducaEn)
  if (!Number.isFinite(t)) return { ok: false, status: 400, motivo: 'caduca_invalida' }
  if (t <= ahora) return { ok: false, status: 400, motivo: 'caduca_pasada' }
  if (t > ahora + MAX_CADUCIDAD_MS) return { ok: false, status: 400, motivo: 'caduca_excesiva' }
  return { ok: true, valor: { token: b.token, caducaEn: new Date(t) } }
}

/** Caducada = `caduca_en` ya alcanzado. Una fecha ilegible cuenta como caducada (estado conservador: no se sirve). */
export function estaCaducada(caducaEn: Date | null | undefined, ahora: number): boolean {
  const t = caducaEn instanceof Date ? caducaEn.getTime() : NaN
  return !Number.isFinite(t) || t <= ahora
}

/** ¿Permiso denegado (42501)? = el GRANT del SQL no está aplicado. */
function esPermisoDenegado(e: unknown): boolean {
  const o = (typeof e === 'object' && e !== null ? e : {}) as { code?: unknown; meta?: { code?: unknown }; message?: unknown }
  if (o.code === '42501' || o.meta?.code === '42501') return true
  return typeof o.message === 'string' && /\b42501\b|permission denied/i.test(o.message)
}

/** Error de BD → qué contesta la ruta. Tabla o GRANT ausentes = SQL sin aplicar (503 claro); el resto, 503 genérico. */
export function clasificarErrorBd(e: unknown): { status: 503; estado: 'sesion_sin_activar' | 'error'; mensaje?: string } {
  if (esTablaAusente(e) || esPermisoDenegado(e)) return { status: 503, estado: 'sesion_sin_activar', mensaje: MENSAJE_SIN_ACTIVAR }
  return { status: 503, estado: 'error' }
}

/**
 * Lo ÚNICO que se loguea de un error de BD: su SQLSTATE / código Prisma. Nunca el mensaje: un CHECK violado de
 * Postgres trae «Failing row contains (…)» con la fila entera, blob incluido.
 */
export function codigoErrorParaLog(e: unknown): string {
  const o = (typeof e === 'object' && e !== null ? e : {}) as { code?: unknown; meta?: { code?: unknown } }
  const c = [o.meta?.code, o.code].find((x): x is string => typeof x === 'string' && /^[A-Z0-9]{1,8}$/.test(x))
  return c ?? 'desconocido'
}
