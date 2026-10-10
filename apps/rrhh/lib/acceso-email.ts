// Acceso del empleado por EMAIL + CÓDIGO de 6 dígitos (05/10/2026). Mismo patrón que el portal
// del cliente de la correduría (apps/asegura-portal, `/api/acceso/*`) y la MISMA lógica de código:
// `@central/core-identity/codigo-otp` (generar, caducidad, intentos, comparación en tiempo constante).
//
// Orquestación PURA con puertos inyectados (repo, envío, reloj) → se testea sin BD ni correo
// (`acceso-email.test.ts`). El adaptador Prisma está en `acceso-email-repo.ts`.
//
// Reglas que este fichero sostiene:
//  · RESPUESTA IDÉNTICA exista o no el email: se escribe fila de código SIEMPRE (con un código que
//    nadie recibe si el email no es de ningún empleado activo) y el envío se programa fuera de la
//    respuesta (`after()` en la ruta), así ni el cuerpo, ni el estado, ni el tiempo dicen nada.
//  · A la BD va el HASH del código (HMAC con `JWT_SECRET`), nunca los 6 dígitos.
//  · El intento se RESERVA antes de comparar, en una escritura condicionada (ráfagas en paralelo).
//  · Topes: por email y por IP contando filas (global, lo ven todas las instancias).
import { createHmac } from 'node:crypto'
import { requireSecret, normalizarEmail } from '@central/core-identity'
import { generarCodigo, estadoCodigo, MAX_INTENTOS, VALIDEZ_MINUTOS, type EstadoCodigo } from '@central/core-identity/codigo-otp'

export { MAX_INTENTOS, VALIDEZ_MINUTOS }

/** Códigos pedidos por el mismo email en una hora (protege su buzón). */
export const MAX_POR_EMAIL_HORA = 5
/** Códigos pedidos desde la misma IP en una hora. Holgado: una nave con 20 operarios tras un router. */
export const MAX_POR_IP_HORA = 20
/** Intentos de PIN tras un código válido (sobre la misma fila de código). */
export const MAX_INTENTOS_PIN = 5
export const MAX_EMAIL = 200
const HORA_MS = 60 * 60 * 1000

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Email normalizado (trim + minúsculas) o `null` si no tiene forma de email. */
export function emailValido(email: unknown): string | null {
  if (typeof email !== 'string' || email.length > MAX_EMAIL) return null
  const n = normalizarEmail(email)
  return n && EMAIL_RE.test(n) ? n : null
}

/**
 * HMAC-SHA256 con `JWT_SECRET` como clave y un prefijo de dominio. Es la pimienta: un SHA-256
 * pelado de 6 dígitos se revierte con un bucle de 10^6. Se deriva del secreto que rrhh YA tiene
 * (no hay env nueva que olvidar en Vercel); rotarlo solo invalida códigos de 10 min.
 */
function hmac(valor: string): string {
  return createHmac('sha256', requireSecret('JWT_SECRET', 'rrhh-dev-secret-change-in-prod')).update(valor).digest('hex')
}
export const hashEmailAcceso = (emailNormalizado: string) => hmac(`rrhh-acceso-email:${emailNormalizado}`)
export const hashCodigoAcceso = (codigo: string) => hmac(`rrhh-acceso-codigo:${codigo}`)

// ── Puertos ─────────────────────────────────────────────────────────────────────────────────
export type OtpFila = { id: string; codigo_hash: string; creada_at: Date; intentos: number; usado_at: Date | null }
export type Candidato = {
  empleado_id: string; empresa_id: string; empresa_nombre: string; nombre: string
  pin_hash: string | null; sesion_version: number
}

export interface RepoAcceso {
  contarRecientesPorEmail(emailHash: string, desde: Date): Promise<number>
  contarRecientesPorIp(ip: string, desde: Date): Promise<number>
  crearOtp(f: { email_hash: string; codigo_hash: string; ip: string }): Promise<void>
  ultimoOtp(emailHash: string): Promise<OtpFila | null>
  /** UPDATE … SET intentos+1 WHERE id AND usado_at IS NULL AND intentos < max. ¿Se reservó? */
  reservarIntento(otpId: string, max: number): Promise<boolean>
  /** UPDATE … SET usado_at=now() WHERE id AND usado_at IS NULL. ¿Lo gastó ESTA petición? */
  gastarOtp(otpId: string): Promise<boolean>
  /** Igual que `reservarIntento` pero sobre `intentos_pin` de una fila YA gastada. */
  reservarIntentoPin(otpId: string, max: number): Promise<boolean>
  /** Empleados ACTIVOS cuyo email normalizado es este (de cualquier empresa). */
  candidatosPorEmail(emailNormalizado: string): Promise<Candidato[]>
}

export type CorreoCodigo = { to: string; nombre: string; empresas: string[]; codigo: string }
export type EnviarCodigo = (c: CorreoCodigo) => Promise<boolean>

// ── Paso 1: pedir código ───────────────────────────────────────────────────────────────────
export type ResultadoSolicitar =
  | { ok: true; envio: (() => Promise<boolean>) | null }
  | { ok: false; error: 'email_invalido'; status: 400 }
  | { ok: false; error: 'demasiadas_peticiones'; status: 429; retryAfter: number }

/**
 * `envio` es la tarea de mandar el correo (o `null` si el email no es de nadie): la ruta la
 * lanza con `after()` para que la respuesta NO espere al SMTP. `null` y no-`null` producen la
 * MISMA respuesta HTTP: es lo que impide enumerar empleados.
 */
export async function solicitarCodigoAcceso(
  repo: RepoAcceso, enviar: EnviarCodigo, entrada: { email: unknown; ip: string }, ahora = new Date(),
): Promise<ResultadoSolicitar> {
  const email = emailValido(entrada.email)
  if (!email) return { ok: false, error: 'email_invalido', status: 400 }
  const emailHash = hashEmailAcceso(email)
  const desde = new Date(ahora.getTime() - HORA_MS)
  // Los contadores cuentan filas que se escriben para CUALQUIER email: no son un oráculo.
  if ((await repo.contarRecientesPorIp(entrada.ip, desde)) >= MAX_POR_IP_HORA
    || (await repo.contarRecientesPorEmail(emailHash, desde)) >= MAX_POR_EMAIL_HORA) {
    return { ok: false, error: 'demasiadas_peticiones', status: 429, retryAfter: HORA_MS / 1000 }
  }
  const codigo = generarCodigo()
  await repo.crearOtp({ email_hash: emailHash, codigo_hash: hashCodigoAcceso(codigo), ip: entrada.ip })
  const candidatos = await repo.candidatosPorEmail(email)
  if (candidatos.length === 0) return { ok: true, envio: null }
  const empresas = [...new Set(candidatos.map(c => c.empresa_nombre).filter(Boolean))]
  return { ok: true, envio: () => enviar({ to: email, nombre: candidatos[0].nombre, empresas, codigo }) }
}

// ── Paso 2: canjear código ─────────────────────────────────────────────────────────────────
export type OpcionEmpresa = { empleado_id: string; empresa_nombre: string; necesita_pin: boolean }
export type ResultadoVerificar =
  | { ok: true; paso: 'sesion'; candidato: Candidato }
  | { ok: true; paso: 'elegir'; otp_id: string; opciones: OpcionEmpresa[] }
  | { ok: false; error: 'datos_invalidos'; status: 400 }
  | { ok: false; error: Exclude<EstadoCodigo, 'valido'> | 'sin_codigo' | 'sin_acceso'; status: 401 }

export async function verificarCodigoAcceso(
  repo: RepoAcceso, entrada: { email: unknown; codigo: unknown }, ahora = new Date(),
): Promise<ResultadoVerificar> {
  const email = emailValido(entrada.email)
  const codigo = typeof entrada.codigo === 'string' ? entrada.codigo.trim() : ''
  if (!email || !/^\d{6}$/.test(codigo)) return { ok: false, error: 'datos_invalidos', status: 400 }

  const fila = await repo.ultimoOtp(hashEmailAcceso(email))
  // Hay fila para cualquier email que haya pedido código: «sin_codigo» solo dice «no lo has pedido».
  if (!fila) return { ok: false, error: 'sin_codigo', status: 401 }

  // 🚨 Se RESERVA el intento antes de comparar (ver asegura-portal `/api/acceso/verificar`).
  if (!(await repo.reservarIntento(fila.id, MAX_INTENTOS))) {
    return { ok: false, error: fila.usado_at ? 'ya_usado' : 'bloqueado', status: 401 }
  }
  const estado = estadoCodigo(
    { codigoHash: fila.codigo_hash, creadoEn: fila.creada_at, intentos: fila.intentos, usadoEn: fila.usado_at },
    hashCodigoAcceso(codigo), ahora,
  )
  if (estado !== 'valido') return { ok: false, error: estado, status: 401 }
  if (!(await repo.gastarOtp(fila.id))) return { ok: false, error: 'ya_usado', status: 401 }

  const candidatos = await repo.candidatosPorEmail(email)
  // Código válido pero ya no hay empleado activo con ese email (baja en esos 10 min).
  if (candidatos.length === 0) return { ok: false, error: 'sin_acceso', status: 401 }
  if (candidatos.length === 1 && !candidatos[0].pin_hash) return { ok: true, paso: 'sesion', candidato: candidatos[0] }
  return {
    ok: true, paso: 'elegir', otp_id: fila.id,
    opciones: candidatos.map(c => ({ empleado_id: c.empleado_id, empresa_nombre: c.empresa_nombre, necesita_pin: !!c.pin_hash })),
  }
}

// ── Paso 3 (solo si hay varias empresas o PIN): elegir empresa / PIN ────────────────────────
export type ResultadoCompletar =
  | { ok: true; candidato: Candidato }
  | { ok: false; error: 'datos_invalidos'; status: 400 }
  | { ok: false; error: 'sin_acceso' | 'pin_incorrecto' | 'bloqueado'; status: 401; necesita_pin?: boolean }

export async function completarAcceso(
  repo: RepoAcceso,
  compararPin: (pin: string, hash: string) => Promise<boolean>,
  ticket: { otp_id: string; empleados: string[] },
  entrada: { email: unknown; empleado_id: unknown; pin: unknown },
): Promise<ResultadoCompletar> {
  const email = emailValido(entrada.email)
  const empleadoId = typeof entrada.empleado_id === 'string' ? entrada.empleado_id : ''
  if (!email || !empleadoId) return { ok: false, error: 'datos_invalidos', status: 400 }
  // Solo se puede elegir entre los empleados que el código validó (van firmados en el ticket).
  if (!ticket.empleados.includes(empleadoId)) return { ok: false, error: 'sin_acceso', status: 401 }
  // Se relee: sigue activo y con ESE email (el ticket no congela una baja de hace 5 minutos).
  const c = (await repo.candidatosPorEmail(email)).find(x => x.empleado_id === empleadoId)
  if (!c) return { ok: false, error: 'sin_acceso', status: 401 }
  if (c.pin_hash) {
    const pin = typeof entrada.pin === 'string' ? entrada.pin : ''
    if (!pin) return { ok: false, error: 'pin_incorrecto', status: 401, necesita_pin: true }
    if (!(await repo.reservarIntentoPin(ticket.otp_id, MAX_INTENTOS_PIN))) return { ok: false, error: 'bloqueado', status: 401 }
    if (!(await compararPin(pin, c.pin_hash))) return { ok: false, error: 'pin_incorrecto', status: 401, necesita_pin: true }
  }
  return { ok: true, candidato: c }
}

// ── Correo ──────────────────────────────────────────────────────────────────────────────────
/** Asunto y cuerpo (texto plano, sobrio). Puro para poder testearlo. */
export function correoCodigo(c: CorreoCodigo): { subject: string; text: string } {
  const empresa = c.empresas.length === 1 ? c.empresas[0] : c.empresas.join(', ')
  const de = empresa ? ` de ${empresa}` : ''
  return {
    subject: `Tu código de acceso al Portal del Empleado${de}`,
    text:
      `Hola${c.nombre ? ` ${c.nombre}` : ''}:\n\n` +
      `Tu código para entrar en el Portal del Empleado${de} es:\n\n    ${c.codigo}\n\n` +
      `Caduca en ${VALIDEZ_MINUTOS} minutos y solo sirve una vez. ` +
      `Si no lo has pedido tú, ignora este mensaje: nadie podrá entrar sin el código.\n`,
  }
}
