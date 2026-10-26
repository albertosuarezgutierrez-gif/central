// Contraseña OPCIONAL del responsable (26/10/2026): alternativa al código por correo, solo en /login.
// Se valida con bcrypt contra `usuarios_rrhh.pass_hash` (el hash de siempre; Pilar conserva su `$2a$`).
//
// 🚨 LISTA BLANCA (revisión del 26/10/2026): antes de #5103 el operador fijaba una contraseña CONOCIDA al dar de alta a
// cada responsable, y esos `pass_hash` siguen en BD. Comparar contra cualquier `pass_hash` los reactivaba. Por eso la
// contraseña SOLO vale para los correos de `RRHH_LOGIN_PASSWORD_EMAILS` (separados por comas, lower/trim). Variable
// ausente o vacía = NADIE entra con contraseña (fail-closed) y la pantalla no ofrece el botón.
//
// 🚨 Respuesta UNIFORME: correo fuera de la lista, usuario inexistente, sin contraseña válida, contraseña errónea y
// cuenta bloqueada por intentos dan EXACTAMENTE el mismo 401, y en todos los casos se ejecuta UNA comparación bcrypt
// (mismo coste), para no distinguirlos por tiempo.
//
// Topes PERSISTENTES (los ven todas las instancias de Vercel): 5 fallos por correo y 30 por IP cada 15 min, contados
// en `rrhh.acceso_otps` con un prefijo propio (ver `acceso-password-repo.ts`; no se mezclan con los topes del código).
import bcrypt from 'bcryptjs'

export type UsuarioConHash = { usuario_id: string; pass_hash: string | null }
export interface RepoPassword {
  /** La fila de `usuarios_rrhh` de ese correo (determinista: la más antigua si hubiera duplicados). */
  usuarioConHash(emailNormalizado: string): Promise<UsuarioConHash | null>
  contarFallosPorEmail(emailNormalizado: string, desde: Date): Promise<number>
  contarFallosPorIp(ip: string, desde: Date): Promise<number>
  registrarFallo(f: { email: string; ip: string }): Promise<void>
}
export type Comparar = (plano: string, hash: string) => Promise<boolean>

export type ResultadoPassword =
  | { ok: true; usuario_id: string }
  | { ok: false; error: 'credenciales_invalidas'; status: 401 }
  | { ok: false; error: 'datos_invalidos'; status: 400 }

export const MAX_FALLOS_EMAIL = 5
export const MAX_FALLOS_IP = 30
export const VENTANA_FALLOS_MS = 15 * 60 * 1000

/** Hash bcrypt válido de un valor descartado: se compara contra él cuando no hay usuario, por igualar el tiempo. */
export const HASH_SEÑUELO = '$2a$10$ZjUlixLth4XUhA5n4z9u7O1ZGU7EHwX7FUJ2jcvsR1kDj5jX1e0ba'

export const comparaBcrypt: Comparar = async (plano, hash) => {
  try { return await bcrypt.compare(plano, hash) } catch { return false }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizarEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length > 0 && e.length <= 200 && EMAIL.test(e) ? e : null
}

/** Correos autorizados a entrar con contraseña. Variable ausente o vacía → conjunto vacío (nadie). */
export function correosConPassword(raw: string | undefined = process.env.RRHH_LOGIN_PASSWORD_EMAILS): Set<string> {
  return new Set((raw ?? '').split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0))
}

/** ¿Se ofrece «Entrar con contraseña»? Solo el booleano sale al cliente, NUNCA la lista. */
export function passwordHabilitada(raw: string | undefined = process.env.RRHH_LOGIN_PASSWORD_EMAILS): boolean {
  return correosConPassword(raw).size > 0
}

const UNIFORME = { ok: false, error: 'credenciales_invalidas', status: 401 } as const

export async function verificarPasswordResponsable(
  repo: RepoPassword,
  entrada: { email: unknown; password: unknown; ip: string },
  opciones: { permitidos?: Set<string>; comparar?: Comparar; ahora?: Date } = {},
): Promise<ResultadoPassword> {
  const permitidos = opciones.permitidos ?? correosConPassword()
  const comparar = opciones.comparar ?? comparaBcrypt
  const ahora = opciones.ahora ?? new Date()
  const email = normalizarEmail(entrada.email)
  const password = entrada.password
  if (!email || typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return { ok: false, error: 'datos_invalidos', status: 400 }
  }
  const desde = new Date(ahora.getTime() - VENTANA_FALLOS_MS)
  const [fallosEmail, fallosIp] = await Promise.all([repo.contarFallosPorEmail(email, desde), repo.contarFallosPorIp(entrada.ip, desde)])
  const bloqueado = fallosEmail >= MAX_FALLOS_EMAIL || fallosIp >= MAX_FALLOS_IP
  // La fila se lee SIEMPRE (mismo coste de BD con o sin lista), pero su hash solo cuenta si el correo está en la lista.
  const u = await repo.usuarioConHash(email)
  const enLista = permitidos.has(email)
  const hash = enLista && !bloqueado && u?.pass_hash && /^\$2[aby]\$/.test(u.pass_hash) ? u.pass_hash : null
  // SIEMPRE una comparación: con o sin usuario, en la lista o no, bloqueado o no.
  const coincide = await comparar(password, hash ?? HASH_SEÑUELO)
  if (!u || !hash || !coincide) {
    // Bloqueado: no se anota (la ventana no se alarga sin fin); se desbloquea solo a los 15 min del último fallo contado.
    if (!bloqueado) await repo.registrarFallo({ email, ip: entrada.ip })
    return UNIFORME
  }
  return { ok: true, usuario_id: u.usuario_id }
}
