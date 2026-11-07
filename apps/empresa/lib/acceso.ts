// Códigos de 6 cifras por correo para ENTRAR y para FIRMAR (`@central/core-identity/codigo-otp`, mismo flujo y topes que
// contabilidad). Orquestación PURA con puertos inyectados: se prueba sin BD ni correo (test/acceso.test.ts).
//
//  · Respuesta IDÉNTICA exista o no el correo (los topes no son un oráculo).
//  · A la BD va el HASH (HMAC con HERRAMIENTAS_SESSION_SECRET y prefijo de dominio POR PROPÓSITO): un código de entrar no
//    sirve para firmar, y el de firmar va atado a UNA versión del contrato (`clave` = versión + correo).
//  · El intento se RESERVA antes de comparar (escritura condicionada): ráfagas en paralelo no multiplican intentos.
import { createHmac } from 'node:crypto'
import { requireSecret } from '@central/core-identity/secret'
import { generarCodigo, estadoCodigo, MAX_INTENTOS, type EstadoCodigo } from '@central/core-identity/codigo-otp'
import { ENV_SESION } from './secretos.ts'

export const MAX_POR_EMAIL_HORA = 5
export const MAX_POR_IP_HORA = 20
const HORA_MS = 60 * 60 * 1000
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type Proposito = 'acceso' | 'firma'
export type EnvioCodigo = 'no_enviado' | 'enviado' | 'fallido'

export function emailValido(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 200) return null
  const n = v.trim().toLowerCase()
  return EMAIL_RE.test(n) ? n : null
}

const hmac = (valor: string) => createHmac('sha256', requireSecret(ENV_SESION)).update(valor).digest('hex')
export const hashClave = (p: Proposito, clave: string) => hmac(`empresa-${p}-clave:${clave}`)
export const hashCodigo = (p: Proposito, codigo: string) => hmac(`empresa-${p}-codigo:${codigo}`)

export type OtpFila = { id: string; codigoHash: string; creadoEn: Date; intentos: number; usadoEn: Date | null }

export interface RepoOtp {
  contarRecientesPorClave(p: Proposito, claveHash: string, desde: Date): Promise<number>
  contarRecientesPorIp(ip: string, desde: Date): Promise<number>
  crearOtp(f: { proposito: Proposito; claveHash: string; codigoHash: string; ip: string; envio: EnvioCodigo }): Promise<void>
  ultimoOtp(p: Proposito, claveHash: string): Promise<OtpFila | null>
  reservarIntento(id: string, max: number): Promise<boolean>
  gastarOtp(id: string): Promise<boolean>
}

export type CanalCodigo = { conectado: boolean; enviar(c: { to: string; codigo: string; proposito: Proposito }): Promise<EnvioCodigo> }
export const CANAL_NO_CONECTADO: CanalCodigo = { conectado: false, enviar: async () => 'no_enviado' }

export type ResultadoSolicitar =
  | { ok: true; enviado: boolean }
  | { ok: false; status: 400; error: 'email_invalido' }
  | { ok: false; status: 429; error: 'demasiadas_peticiones'; retryAfter: number }
  | { ok: false; status: 502; error: 'envio_fallido' }

/**
 * `destinatarioValido` decide si de verdad se envía (persona con acceso; para firmar, el dueño de esa versión). La fila se
 * escribe SIEMPRE, se envíe o no: misma respuesta y mismos topes para un correo que no existe.
 */
export async function solicitarCodigo(
  repo: RepoOtp, canal: CanalCodigo,
  e: { email: unknown; ip: string; proposito: Proposito; clave?: string; destinatarioValido: (email: string) => Promise<boolean> },
  ahora = new Date(),
): Promise<ResultadoSolicitar> {
  const email = emailValido(e.email)
  if (!email) return { ok: false, status: 400, error: 'email_invalido' }
  const claveHash = hashClave(e.proposito, e.clave ?? email)
  const desde = new Date(ahora.getTime() - HORA_MS)
  if ((await repo.contarRecientesPorIp(e.ip, desde)) >= MAX_POR_IP_HORA
    || (await repo.contarRecientesPorClave(e.proposito, claveHash, desde)) >= MAX_POR_EMAIL_HORA) {
    return { ok: false, status: 429, error: 'demasiadas_peticiones', retryAfter: HORA_MS / 1000 }
  }
  const codigo = generarCodigo()
  const valido = canal.conectado ? await e.destinatarioValido(email) : false
  const envio: EnvioCodigo = valido ? await canal.enviar({ to: email, codigo, proposito: e.proposito }) : 'no_enviado'
  await repo.crearOtp({ proposito: e.proposito, claveHash, codigoHash: hashCodigo(e.proposito, codigo), ip: e.ip, envio })
  if (envio === 'fallido') return { ok: false, status: 502, error: 'envio_fallido' }
  if (process.env.NODE_ENV === 'development' && !canal.conectado) console.info(`[empresa] código (${e.proposito}, solo desarrollo) para ${email}: ${codigo}`)
  return { ok: true, enviado: canal.conectado }
}

export type ResultadoCanje =
  | { ok: true }
  | { ok: false; status: 400; error: 'datos_invalidos' }
  | { ok: false; status: 401; error: Exclude<EstadoCodigo, 'valido'> | 'sin_codigo' }

/** Reserva intento → compara → gasta. Solo dice si el código vale; quién es la persona lo decide el llamante en BD. */
export async function canjearCodigo(
  repo: RepoOtp, e: { email: unknown; codigo: unknown; proposito: Proposito; clave?: string }, ahora = new Date(),
): Promise<ResultadoCanje> {
  const email = emailValido(e.email)
  const codigo = typeof e.codigo === 'string' ? e.codigo.trim() : ''
  if (!email || !/^\d{6}$/.test(codigo)) return { ok: false, status: 400, error: 'datos_invalidos' }
  const fila = await repo.ultimoOtp(e.proposito, hashClave(e.proposito, e.clave ?? email))
  if (!fila) return { ok: false, status: 401, error: 'sin_codigo' }
  if (!(await repo.reservarIntento(fila.id, MAX_INTENTOS))) return { ok: false, status: 401, error: fila.usadoEn ? 'ya_usado' : 'bloqueado' }
  const estado = estadoCodigo({ codigoHash: fila.codigoHash, creadoEn: fila.creadoEn, intentos: fila.intentos, usadoEn: fila.usadoEn }, hashCodigo(e.proposito, codigo), ahora)
  if (estado !== 'valido') return { ok: false, status: 401, error: estado }
  if (!(await repo.gastarOtp(fila.id))) return { ok: false, status: 401, error: 'ya_usado' }
  return { ok: true }
}

export const claveFirma = (versionId: string, email: string) => `${versionId.toLowerCase()}:${email}`
