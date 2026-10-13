// Máquina de estados de un trabajo de tarificación RPA y su política de reintento (05/10/2026).
//
//   pendiente ──► en_curso ──► ok
//       │            ├──────► error_reintentable ──► pendiente (UNA vez, solo infra)
//       │            ├──────► error_definitivo
//       │            ├──────► requiere_humano (CAPTCHA, etc.: nunca se evita)
//       └──► cancelado ◄──────┘ (desde cualquier no terminal)
//
// 🚨 Un portal de compañía no es una API: cada intento es un login más con NUESTRA credencial.
//    Por eso se reintenta UNA sola vez y solo lo que es de infraestructura (red, máquina, lease
//    vencido). Un selector que no aparece, unas credenciales rechazadas o un CAPTCHA no se arreglan
//    repitiendo: insistir es la forma de que bloqueen la cuenta.

export const ESTADOS_TRABAJO = [
  'pendiente',
  'en_curso',
  'ok',
  'error_reintentable',
  'error_definitivo',
  'requiere_humano',
  'cancelado',
  // EMISIÓN (10/10/2026, emision.ts): el worker paró en la pantalla previa y espera el botón de Alberto (24 h);
  // Alberto autorizó y espera máquina; la póliza se emitió (terminal OK).
  'pendiente_autorizacion_emision',
  'autorizado_emision',
  'emitido',
] as const

export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]

export const ESTADOS_TERMINALES: readonly EstadoTrabajo[] = ['ok', 'error_definitivo', 'requiere_humano', 'cancelado', 'emitido']

const TRANSICIONES: Record<EstadoTrabajo, readonly EstadoTrabajo[]> = {
  pendiente: ['en_curso', 'cancelado'],
  en_curso: ['ok', 'error_reintentable', 'error_definitivo', 'requiere_humano', 'cancelado', 'pendiente_autorizacion_emision', 'emitido'],
  error_reintentable: ['pendiente', 'error_definitivo', 'cancelado'],
  ok: [],
  error_definitivo: [],
  // Lo resuelve una persona y, si procede, encola un trabajo NUEVO: este no se reanuda.
  requiere_humano: ['cancelado'],
  cancelado: [],
  // Sin pulsar en 24 h → cancelado. Rechazar → cancelado. Autorizar → autorizado_emision.
  pendiente_autorizacion_emision: ['autorizado_emision', 'cancelado'],
  // La reanudación (relogin, pantalla previa, canje, UN clic) NO es un reintento: vuelve a en_curso.
  autorizado_emision: ['en_curso', 'cancelado'],
  emitido: [],
}

export function esEstadoTrabajo(v: unknown): v is EstadoTrabajo {
  return typeof v === 'string' && (ESTADOS_TRABAJO as readonly string[]).includes(v)
}

export function puedeTransitar(de: unknown, a: unknown): boolean {
  if (!esEstadoTrabajo(de) || !esEstadoTrabajo(a)) return false
  return TRANSICIONES[de].includes(a)
}

/** Tipos de fallo que el worker (o el orquestador) puede declarar. */
export const TIPOS_ERROR = ['infra', 'portal', 'credenciales', 'datos', 'captcha', 'emision'] as const
export type TipoError = (typeof TIPOS_ERROR)[number]

export function esTipoError(v: unknown): v is TipoError {
  return typeof v === 'string' && (TIPOS_ERROR as readonly string[]).includes(v)
}

/** Intentos totales permitidos (el primero + UN reintento). */
export const MAX_INTENTOS = 2

/**
 * A qué estado pasa un trabajo `en_curso` que falla. `intentos` = los ya consumidos (se cuenta al
 * reclamarlo). Un tipo desconocido se trata como definitivo: no se reintenta lo que no se entiende.
 */
export function estadoTrasError(tipo: unknown, intentos: number): EstadoTrabajo {
  if (tipo === 'captcha') return 'requiere_humano'
  if (tipo === 'infra') return puedeReintentar('error_reintentable', intentos) ? 'error_reintentable' : 'error_definitivo'
  return 'error_definitivo'
}

/** ¿Se puede volver a poner en cola? Solo `error_reintentable` y con intentos por debajo del tope. */
export function puedeReintentar(estado: unknown, intentos: number): boolean {
  if (estado !== 'error_reintentable') return false
  if (!Number.isInteger(intentos) || intentos < 0) return false
  return intentos < MAX_INTENTOS
}
