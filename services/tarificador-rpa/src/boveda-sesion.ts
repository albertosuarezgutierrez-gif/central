// Bóveda de la sesión MANUAL de un portal (07/10/2026). Para portales que piden SMS en el acceso (Generali):
// Alberto inicia sesión UNA vez, a mano, con su SMS; el robot reutiliza esa sesión mientras siga viva y, cuando
// caduca, para y avisa. El robot NUNCA hace login en esos portales: ni reenvía SMS, ni lee OTP, ni guarda contraseñas.
//
// 🔑 El storageState (cookies + localStorage) solo sale de este proceso SELLADO con AES-256-GCM:
//    · clave = fly secret `TARIFICADOR_SESION_KEY` (32 bytes en base64), sin fallback. Asegura guarda el blob
//      opaco y NO tiene la clave: ni la BD ni Vercel pueden abrirlo.
//    · AAD = versión + compañía: el blob de una compañía no abre como otra.
//    · la caducidad va DENTRO del texto autenticado: no se alarga tocando el blob ni la fila.
//    · el valor abierto vive solo en memoria y no se serializa (toJSON/inspect lo tapan).
// Puro (node:crypto, sin red ni disco): `tsx --test`.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { inspect } from 'node:util'
import type { EstadoNavegador } from './sesion.ts'

export const NOMBRE_CLAVE_SESION = 'TARIFICADOR_SESION_KEY'
export const NOMBRE_MAX_HORAS = 'TARIFICADOR_SESION_MAX_HORAS'
/** Caducidad por defecto de una sesión manual, aunque el portal la mantuviera viva más. */
export const MAX_HORAS_DEFECTO = 8
/** Techo duro: ninguna configuración la alarga más allá de esto. */
export const MAX_HORAS_TECHO = 24
const VERSION = 'v1'

/** Clave de la bóveda desde el entorno. Sin fallback: sin el fly secret (o mal formado) se lanza. */
export function claveSesion(env: Record<string, string | undefined>): Buffer {
  const v = (env[NOMBRE_CLAVE_SESION] ?? '').trim()
  if (!v) throw new Error(`${NOMBRE_CLAVE_SESION} no configurado (fly secret; sin fallback)`)
  const k = Buffer.from(v, 'base64')
  if (k.length !== 32) throw new Error(`${NOMBRE_CLAVE_SESION} tiene que ser 32 bytes en base64`)
  return k
}

/** Caducidad máxima en ms (configurable, acotada a [1 h, 24 h]). Un valor ilegible = el defecto, nunca más. */
export function caducidadMaximaMs(env: Record<string, string | undefined>): number {
  const n = Number((env[NOMBRE_MAX_HORAS] ?? '').trim())
  const horas = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), MAX_HORAS_TECHO) : MAX_HORAS_DEFECTO
  return Math.round(horas * 3_600_000)
}

const aad = (compania: string) => Buffer.from(`tarificador-sesion:${VERSION}:${compania.trim().toLowerCase()}`)
const b64u = (b: Buffer) => b.toString('base64url')

type Carga = { v: 1; compania: string; creada: number; caduca: number; estado: EstadoNavegador }

/**
 * Sella el estado. `caduca` = min(caducaPedida ?? ahora + max, ahora + max): al re-sellar una sesión refrescada se pasa
 * la caducidad ORIGINAL, de modo que el uso nunca alarga la sesión que dio de alta una persona.
 */
export function sellarSesion(
  estado: EstadoNavegador,
  o: { compania: string; clave: Buffer; ahora: number; maxMs: number; caducaPedida?: number },
): { token: string; caduca: number } {
  const techo = o.ahora + o.maxMs
  const caduca = Math.min(o.caducaPedida ?? techo, techo)
  const carga: Carga = { v: 1, compania: o.compania.trim().toLowerCase(), creada: o.ahora, caduca, estado }
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', o.clave, iv)
  c.setAAD(aad(o.compania))
  const ct = Buffer.concat([c.update(JSON.stringify(carga), 'utf8'), c.final()])
  return { token: `${VERSION}.${b64u(iv)}.${b64u(Buffer.concat([ct, c.getAuthTag()]))}`, caduca }
}

/** Estado abierto: solo en memoria, nunca serializable. */
export class SesionAbierta {
  readonly #valor: EstadoNavegador
  readonly caduca: number
  constructor(valor: EstadoNavegador, caduca: number) {
    this.#valor = valor
    this.caduca = caduca
  }
  get valor(): EstadoNavegador {
    return this.#valor
  }
  toJSON(): string {
    return '[sesion]'
  }
  [inspect.custom](): string {
    return '[sesion]'
  }
}

export type Apertura = { estado: 'ok'; sesion: SesionAbierta } | { estado: 'caducada' } | { estado: 'invalida' }

/** Abre un token. Nunca lanza ni devuelve detalles: manipulado, otra clave u otra compañía = `invalida`. */
export function abrirSesion(token: string, o: { compania: string; clave: Buffer; ahora: number }): Apertura {
  try {
    const [ver, ivS, datosS, ...resto] = String(token).split('.')
    if (ver !== VERSION || !ivS || !datosS || resto.length) return { estado: 'invalida' }
    const iv = Buffer.from(ivS, 'base64url')
    const datos = Buffer.from(datosS, 'base64url')
    if (iv.length !== 12 || datos.length < 17) return { estado: 'invalida' }
    const d = createDecipheriv('aes-256-gcm', o.clave, iv)
    d.setAAD(aad(o.compania))
    d.setAuthTag(datos.subarray(datos.length - 16))
    const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]).toString('utf8')
    const c = JSON.parse(plano) as Carga
    if (c.v !== 1 || c.compania !== o.compania.trim().toLowerCase() || !Number.isFinite(c.caduca)) return { estado: 'invalida' }
    if (!c.estado || !Array.isArray(c.estado.cookies) || !Array.isArray(c.estado.origins)) return { estado: 'invalida' }
    if (o.ahora >= c.caduca) return { estado: 'caducada' }
    return { estado: 'ok', sesion: new SesionAbierta(c.estado, c.caduca) }
  } catch {
    return { estado: 'invalida' }
  }
}
