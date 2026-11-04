// Login por PIN GENÉRICO (extraído de apps/ia-rest, 04/11/2026): lógica PURA y agnóstica de BD.
//
// Qué hay aquí: formato del PIN, hash con sal (PBKDF2-SHA256), verificación en tiempo constante,
// política de bloqueo (N fallos → T minutos) como función pura con `ahora` inyectado, firma HMAC
// de la sesión y el PUERTO `PinStore` que cada app implementa (Prisma/Supabase).
//
// 🚨 Web Crypto (`crypto.subtle`), NO `node:crypto`: core-identity promete valer en edge y el
// guardián `regression-secretos-tiempo-constante` impide arrastrar `node:crypto` aquí. Por eso
// hash y firma son ASÍNCRONOS. La comparación reutiliza `secretoCoincide` (tiempo constante).
import { secretoCoincide } from './secreto-comparar.ts'
import { requireSecret } from './secret.ts'

// ── Formato ────────────────────────────────────────────────────────────────
export type OpcionesFormatoPin = {
  /** Dígitos exactos. Por defecto 4. */
  longitud?: number
  /** true → rechaza 0000, 1111, 1234, 4321... Por defecto false. */
  rechazarTriviales?: boolean
}
export type ErrorFormatoPin = 'no_es_texto' | 'longitud' | 'no_digitos' | 'trivial'

export const LONGITUD_PIN_POR_DEFECTO = 4

/** Todos iguales o escalera ascendente/descendente (0000, 1234, 4321, 9876). */
export function esPinTrivial(pin: string): boolean {
  if (pin.length < 2) return true
  const d = [...pin].map(Number)
  if (d.every(x => x === d[0])) return true
  const paso = d[1] - d[0]
  return (paso === 1 || paso === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === paso)
}

/** Valida el formato. No normaliza (no recorta espacios): un PIN con espacios es inválido. */
export function validarFormatoPin(
  pin: unknown,
  { longitud = LONGITUD_PIN_POR_DEFECTO, rechazarTriviales = false }: OpcionesFormatoPin = {},
): { ok: true } | { ok: false; error: ErrorFormatoPin } {
  if (typeof pin !== 'string') return { ok: false, error: 'no_es_texto' }
  if (pin.length !== longitud) return { ok: false, error: 'longitud' }
  if (!/^[0-9]+$/.test(pin)) return { ok: false, error: 'no_digitos' }
  if (rechazarTriviales && esPinTrivial(pin)) return { ok: false, error: 'trivial' }
  return { ok: true }
}

// ── Hash con sal (PBKDF2-SHA256, Web Crypto) ───────────────────────────────
export const ITERACIONES_PIN = 100_000
const FORMATO = 'pbkdf2-sha256'

const aHex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
const deHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map(x => parseInt(x, 16)))

async function derivar(pin: string, sal: Uint8Array, iteraciones: number): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones },
    clave,
    256,
  )
  return aHex(bits)
}

/** Hash autodescriptivo `pbkdf2-sha256$iter$salHex$hashHex` con sal aleatoria por PIN. */
export async function hashPin(pin: string, iteraciones = ITERACIONES_PIN): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  return `${FORMATO}$${iteraciones}$${aHex(sal)}$${await derivar(pin, sal, iteraciones)}`
}

/** Verifica un PIN contra su hash en tiempo constante. Hash malformado ⇒ false (fail-closed). */
export async function verificarPin(pin: string, hashGuardado: string | null | undefined): Promise<boolean> {
  if (typeof pin !== 'string' || typeof hashGuardado !== 'string') return false
  const [fmt, it, sal, hash] = hashGuardado.split('$')
  const iteraciones = Number(it)
  if (fmt !== FORMATO || !Number.isInteger(iteraciones) || iteraciones < 1 || !sal || !hash) return false
  return secretoCoincide(await derivar(pin, deHex(sal), iteraciones), hash)
}

// ── Política de bloqueo (pura) ─────────────────────────────────────────────
export type EstadoBloqueo = { intentos: number; bloqueadoHasta: Date | null }
export type PoliticaBloqueo = { maxIntentos: number; bloqueoMinutos: number }
export const POLITICA_BLOQUEO_POR_DEFECTO: PoliticaBloqueo = { maxIntentos: 5, bloqueoMinutos: 15 }
export const ESTADO_BLOQUEO_INICIAL: EstadoBloqueo = { intentos: 0, bloqueadoHasta: null }

/** ¿Sigue bloqueado en `ahora`? Un bloqueo vencido ya no bloquea. */
export function estaBloqueado(e: EstadoBloqueo, ahora: Date): boolean {
  return e.bloqueadoHasta !== null && e.bloqueadoHasta.getTime() > ahora.getTime()
}

/** Minutos (redondeo arriba) que faltan; 0 si no está bloqueado. */
export function minutosRestantes(e: EstadoBloqueo, ahora: Date): number {
  return estaBloqueado(e, ahora) ? Math.ceil((e.bloqueadoHasta!.getTime() - ahora.getTime()) / 60000) : 0
}

/** Estado tras un fallo. Si el bloqueo había vencido, la cuenta arranca de cero. No muta. */
export function registrarFallo(
  e: EstadoBloqueo,
  ahora: Date,
  p: PoliticaBloqueo = POLITICA_BLOQUEO_POR_DEFECTO,
): EstadoBloqueo {
  if (estaBloqueado(e, ahora)) return e // ya bloqueado: un fallo más no alarga el bloqueo
  const intentos = (e.bloqueadoHasta ? 0 : e.intentos) + 1
  return intentos >= p.maxIntentos
    ? { intentos, bloqueadoHasta: new Date(ahora.getTime() + p.bloqueoMinutos * 60000) }
    : { intentos, bloqueadoHasta: null }
}

/** Tras un acierto, la cuenta vuelve a cero. */
export const registrarAcierto = (): EstadoBloqueo => ({ ...ESTADO_BLOQUEO_INICIAL })

export function intentosRestantes(e: EstadoBloqueo, p: PoliticaBloqueo = POLITICA_BLOQUEO_POR_DEFECTO): number {
  return Math.max(0, p.maxIntentos - e.intentos)
}

// ── Puerto de persistencia ─────────────────────────────────────────────────
export type CredencialPin = {
  /** Id del usuario/camarero/mecánico dueño del PIN. */
  usuarioId: string
  pinHash: string
  /** Rol y demás datos que la app quiera en la sesión. */
  rol?: string
  [extra: string]: unknown
}

/**
 * Lo implementa cada app (Prisma/Supabase). El módulo no sabe de tablas.
 * `clave` del bloqueo = lo que la app decida limitar (p. ej. `${tenantId}:${ip}`, como ia-rest).
 */
export interface PinStore {
  /**
   * Credenciales candidatas. Con `usuarioId` → solo esa (PIN por usuario). Sin él → todas las del
   * tenant (login «solo PIN» como ia-rest: el PIN identifica al usuario dentro del tenant).
   */
  buscarCredenciales(tenantId: string, usuarioId?: string): Promise<CredencialPin[]>
  /** Estado actual del bloqueo (o el inicial si no hay registro). */
  leerBloqueo(clave: string): Promise<EstadoBloqueo>
  /** Persiste el estado calculado por `registrarFallo`. Atómico si la BD lo permite. */
  guardarBloqueo(clave: string, estado: EstadoBloqueo): Promise<void>
  /** Borra el estado (tras acierto). */
  resetearBloqueo(clave: string): Promise<void>
}

export type ResultadoLoginPin =
  | { ok: true; credencial: CredencialPin }
  | { ok: false; motivo: 'formato'; error: ErrorFormatoPin }
  | { ok: false; motivo: 'bloqueado'; minutos: number }
  | { ok: false; motivo: 'incorrecto'; intentosRestantes: number }

export type OpcionesLoginPin = OpcionesFormatoPin & {
  tenantId: string
  usuarioId?: string
  /** Clave del limitador (tenant+IP...). */
  claveBloqueo: string
  pin: unknown
  /** Reloj inyectado: nunca `new Date()` dentro de la lógica. */
  ahora: Date
  politica?: PoliticaBloqueo
}

/**
 * Orquesta formato → bloqueo → verificación → registro. Recorre TODAS las candidatas (sin
 * cortocircuitar) para no filtrar por tiempo cuál usuario acertó.
 */
export async function loginConPin(store: PinStore, o: OpcionesLoginPin): Promise<ResultadoLoginPin> {
  const politica = o.politica ?? POLITICA_BLOQUEO_POR_DEFECTO
  const f = validarFormatoPin(o.pin, o)
  if (!f.ok) return { ok: false, motivo: 'formato', error: f.error }
  const pin = o.pin as string

  const estado = await store.leerBloqueo(o.claveBloqueo)
  if (estaBloqueado(estado, o.ahora)) return { ok: false, motivo: 'bloqueado', minutos: minutosRestantes(estado, o.ahora) }

  const candidatas = await store.buscarCredenciales(o.tenantId, o.usuarioId)
  let acierto: CredencialPin | null = null
  for (const c of candidatas) {
    if ((await verificarPin(pin, c.pinHash)) && !acierto) acierto = c
  }

  if (acierto) {
    await store.resetearBloqueo(o.claveBloqueo)
    return { ok: true, credencial: acierto }
  }
  const nuevo = registrarFallo(estado, o.ahora, politica)
  await store.guardarBloqueo(o.claveBloqueo, nuevo)
  return estaBloqueado(nuevo, o.ahora)
    ? { ok: false, motivo: 'bloqueado', minutos: minutosRestantes(nuevo, o.ahora) }
    : { ok: false, motivo: 'incorrecto', intentosRestantes: intentosRestantes(nuevo, politica) }
}

// ── Firma de sesión (generalizada de apps/ia-rest/src/lib/session-sign.ts) ─
function jsonCanonico(o: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm)
    if (v && typeof v === 'object') {
      const r: Record<string, unknown> = {}
      for (const k of Object.keys(v as object).filter(k => k !== '_sig').sort()) r[k] = norm((v as Record<string, unknown>)[k])
      return r
    }
    return v
  }
  return JSON.stringify(norm(o))
}

async function hmacHex(secreto: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return aHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)))
}

/** Añade `_sig` (HMAC-SHA256 del JSON canónico, claves ordenadas). Secreto vía requireSecret, nunca literal. */
export async function firmarSesionPin<T extends Record<string, unknown>>(
  sesion: T,
  nombreSecreto = 'SESSION_SECRET',
): Promise<T & { _sig: string }> {
  return { ...sesion, _sig: await hmacHex(requireSecret(nombreSecreto), jsonCanonico(sesion)) }
}

/** true solo si `_sig` existe y coincide (tiempo constante). Sin secreto o sin firma ⇒ false. */
export async function verificarSesionPin(
  sesion: Record<string, unknown> | null | undefined,
  nombreSecreto = 'SESSION_SECRET',
): Promise<boolean> {
  const sig = sesion?._sig
  if (typeof sig !== 'string') return false
  try {
    return secretoCoincide(sig, await hmacHex(requireSecret(nombreSecreto), jsonCanonico(sesion)))
  } catch {
    return false
  }
}
