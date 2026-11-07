// Acceso del dueño y del gestor por CORREO + CÓDIGO de 6 dígitos (modelo de apps/rrhh `/login`).
// Lógica del código: `@central/core-identity/codigo-otp` (generar, caducidad, intentos, comparación en tiempo constante).
//
// Orquestación PURA con puertos inyectados (repo, envío, reloj): se prueba sin BD ni correo (test/acceso.test.ts).
//
// Reglas que sostiene:
//  · RESPUESTA IDÉNTICA exista o no el correo: se escribe la fila del código SIEMPRE (los topes no son un oráculo).
//  · A la BD va el HASH del código (HMAC con la pimienta `CONTABILIDAD_SESSION_SECRET`, prefijo de dominio), nunca los dígitos.
//  · El intento se RESERVA antes de comparar (escritura condicionada): ráfagas en paralelo no multiplican intentos.
//  · El canal de correo (`lib/canal-correo.ts`, core-email) se inyecta desde la ruta. Sin proveedor configurado la ruta responde
//    503 `canal_no_disponible` (no llega aquí); si el proveedor falla con un usuario real, 502 `envio_fallido` y la fila queda «fallido».
import { createHmac } from 'node:crypto'
import { requireSecret } from '@central/core-identity/secret'
import { generarCodigo, estadoCodigo, MAX_INTENTOS, type EstadoCodigo } from '@central/core-identity/codigo-otp'

export const SECRETO_SESION = 'CONTABILIDAD_SESSION_SECRET'
export const MAX_POR_EMAIL_HORA = 5
export const MAX_POR_IP_HORA = 20
const HORA_MS = 60 * 60 * 1000
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function emailValido(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 200) return null
  const n = v.trim().toLowerCase()
  return EMAIL_RE.test(n) ? n : null
}

const hmac = (valor: string) => createHmac('sha256', requireSecret(SECRETO_SESION)).update(valor).digest('hex')
export const hashEmailAcceso = (email: string) => hmac(`contabilidad-acceso-email:${email}`)
export const hashCodigoAcceso = (codigo: string) => hmac(`contabilidad-acceso-codigo:${codigo}`)

export type EnvioCodigo = 'no_enviado' | 'enviado' | 'fallido'
export type OtpFila = { id: string; codigoHash: string; creadoEn: Date; intentos: number; usadoEn: Date | null }
export type UsuarioAcceso = { id: string; nombre: string; sv: number }
export type EmpresaDeUsuario = { empresaId: string; razonSocial: string; rol: 'dueno' | 'gestor' }

export interface RepoAcceso {
  contarRecientesPorEmail(emailHash: string, desde: Date): Promise<number>
  contarRecientesPorIp(ip: string, desde: Date): Promise<number>
  crearOtp(f: { emailHash: string; codigoHash: string; ip: string; envio: EnvioCodigo }): Promise<void>
  ultimoOtp(emailHash: string): Promise<OtpFila | null>
  /** UPDATE … SET intentos+1 WHERE id AND usado_en IS NULL AND intentos < max. ¿Se reservó? */
  reservarIntento(id: string, max: number): Promise<boolean>
  /** UPDATE … SET usado_en=now() WHERE id AND usado_en IS NULL. ¿Lo gastó ESTA petición? */
  gastarOtp(id: string): Promise<boolean>
  usuarioPorEmail(email: string): Promise<UsuarioAcceso | null>
  empresasDeUsuario(usuarioId: string): Promise<EmpresaDeUsuario[]>
}

/** Canal de envío del código (puerto). El real está en `lib/canal-correo.ts`; `CANAL_NO_CONECTADO` queda para pruebas y desarrollo. */
export type CanalCodigo = { conectado: boolean; enviar(c: { to: string; codigo: string }): Promise<EnvioCodigo> }
export const CANAL_NO_CONECTADO: CanalCodigo = { conectado: false, enviar: async () => 'no_enviado' }

export type ResultadoSolicitar =
  | { ok: true; enviado: boolean }
  | { ok: false; status: 400; error: 'email_invalido' }
  | { ok: false; status: 429; error: 'demasiadas_peticiones'; retryAfter: number }
  | { ok: false; status: 502; error: 'envio_fallido' }

export async function solicitarCodigo(
  repo: RepoAcceso, canal: CanalCodigo, entrada: { email: unknown; ip: string }, ahora = new Date(),
): Promise<ResultadoSolicitar> {
  const email = emailValido(entrada.email)
  if (!email) return { ok: false, status: 400, error: 'email_invalido' }
  const emailHash = hashEmailAcceso(email)
  const desde = new Date(ahora.getTime() - HORA_MS)
  if ((await repo.contarRecientesPorIp(entrada.ip, desde)) >= MAX_POR_IP_HORA
    || (await repo.contarRecientesPorEmail(emailHash, desde)) >= MAX_POR_EMAIL_HORA) {
    return { ok: false, status: 429, error: 'demasiadas_peticiones', retryAfter: HORA_MS / 1000 }
  }
  const codigo = generarCodigo()
  // Solo se intentaría enviar a un usuario existente; la respuesta es la misma en ambos casos.
  const usuario = canal.conectado ? await repo.usuarioPorEmail(email) : null
  const envio: EnvioCodigo = usuario ? await canal.enviar({ to: email, codigo }) : 'no_enviado'
  await repo.crearOtp({ emailHash, codigoHash: hashCodigoAcceso(codigo), ip: entrada.ip, envio })
  if (envio === 'fallido') return { ok: false, status: 502, error: 'envio_fallido' }
  // Desarrollo local SOLO (Vercel ejecuta preview y producción con NODE_ENV=production): sin canal no habría forma de entrar.
  if (process.env.NODE_ENV === 'development' && !canal.conectado) console.info(`[contabilidad] código de acceso (solo desarrollo) para ${email}: ${codigo}`)
  return { ok: true, enviado: canal.conectado }
}

export type ResultadoVerificar =
  | { ok: true; usuario: UsuarioAcceso; empresas: EmpresaDeUsuario[] }
  | { ok: false; status: 400; error: 'datos_invalidos' }
  | { ok: false; status: 401; error: Exclude<EstadoCodigo, 'valido'> | 'sin_codigo' | 'sin_acceso' }

/** Reserva intento → compara → gasta → usuario activo con al menos una empresa. */
export async function verificarCodigo(
  repo: RepoAcceso, entrada: { email: unknown; codigo: unknown }, ahora = new Date(),
): Promise<ResultadoVerificar> {
  const email = emailValido(entrada.email)
  const codigo = typeof entrada.codigo === 'string' ? entrada.codigo.trim() : ''
  if (!email || !/^\d{6}$/.test(codigo)) return { ok: false, status: 400, error: 'datos_invalidos' }
  const fila = await repo.ultimoOtp(hashEmailAcceso(email))
  if (!fila) return { ok: false, status: 401, error: 'sin_codigo' }
  if (!(await repo.reservarIntento(fila.id, MAX_INTENTOS))) {
    return { ok: false, status: 401, error: fila.usadoEn ? 'ya_usado' : 'bloqueado' }
  }
  const estado = estadoCodigo({ codigoHash: fila.codigoHash, creadoEn: fila.creadoEn, intentos: fila.intentos, usadoEn: fila.usadoEn }, hashCodigoAcceso(codigo), ahora)
  if (estado !== 'valido') return { ok: false, status: 401, error: estado }
  if (!(await repo.gastarOtp(fila.id))) return { ok: false, status: 401, error: 'ya_usado' }
  const usuario = await repo.usuarioPorEmail(email)
  if (!usuario) return { ok: false, status: 401, error: 'sin_acceso' }
  const empresas = await repo.empresasDeUsuario(usuario.id)
  if (!empresas.length) return { ok: false, status: 401, error: 'sin_acceso' }
  return { ok: true, usuario, empresas }
}

/** Con UNA empresa se entra directo; con varias (gestor) se elige. La elección se revalida siempre en BD (`sesion_vigente`). */
export const empresaInicial = (empresas: readonly EmpresaDeUsuario[]): string | null => (empresas.length === 1 ? empresas[0].empresaId : null)
