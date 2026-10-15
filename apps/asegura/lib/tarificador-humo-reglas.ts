// PRUEBA NOCTURNA DE HUMO del tarificador RPA (15/10/2026) — reglas PURAS. Detecta de madrugada que un portal ha cambiado el
// login o el menú, antes de que un comercial se encuentre el fallo. La parte con BD y Telegram está en `tarificador-humo.ts`;
// las rutas, en app/api/cron/tarificador-humo (03:15 Madrid, encola) y tarificador-humo-informe (04:15, avisa).
//
// 🚨 Un trabajo de humo NO es una tarificación: modo `humo`, sin cliente, sin póliza, sin oportunidad y con el riesgo VACÍO.
//    El worker (services/tarificador-rpa/src/humo.ts) solo hace login y llega a la pantalla de inicio del tarificador.
// 🚨 No cuenta en ninguna estadística de tarificación (ni éxito ni fallo), no va a la bandeja de fallos y no entra en la
//    deduplicación de los trabajos reales (ni la bloquea ni se confunde con ella).

import { escapeHtml } from '@central/core-telegram'

export const MODO_HUMO = 'humo'
export const ORIGEN_HUMO = 'humo-nocturno'
/** El riesgo de un trabajo de humo: vacío. No lleva ningún dato de nadie. */
export const RIESGO_HUMO: Readonly<Record<string, never>> = Object.freeze({})
/** Hora de Madrid a la que se encola (03:15) y a la que se informa (04:15). */
export const HORA_ENCOLAR_HUMO = 3
export const HORA_INFORME_HUMO = 4
/** El informe mira los trabajos de humo creados en las últimas horas (el de la noche; no los de ayer). */
export const VENTANA_INFORME_HUMO_HORAS = 6
/** Un humo aún `pendiente` pasada esta espera ya no se lanzará esta noche: el informe lo cierra como fallo. */
export const ESTADOS_HUMO_VIVOS = ['pendiente', 'en_curso', 'error_reintentable'] as const
/** Marca del mensaje de un humo cancelado porque otra pareja de la MISMA compañía halló la contraseña rechazada. */
export const MENSAJE_HUMO_OMITIDO_CREDENCIALES = 'humo_omitido: otra prueba de esta compañía halló las credenciales rechazadas; no se repite el login'
/** Prefijo del mensaje de un humo OMITIDO por el worker (compañía sin adaptador activo en la imagen): ni éxito ni fallo, no se informa. */
export const PREFIJO_HUMO_NO_SOPORTADO = 'humo_no_soportado'
export const MAX_LINEAS_AVISO_HUMO = 15

/** Interruptor propio (apagado por defecto): sin `TARIFICADOR_HUMO_ACTIVO=1` ni se encola ni se reclama un humo. */
export function humoActivo(env: Record<string, string | undefined>): boolean {
  return (env.TARIFICADOR_HUMO_ACTIVO ?? '').trim() === '1'
}

/** Hora (0-23) en Madrid. Vercel cron va en UTC: el verano y el invierno se resuelven con dos entradas y esta guarda. */
export function horaEnMadrid(ahora: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(ahora)
  return Number.parseInt(h, 10)
}

export const esHoraDeEncolarHumo = (ahora: Date): boolean => horaEnMadrid(ahora) === HORA_ENCOLAR_HUMO
export const esHoraDeInformarHumo = (ahora: Date): boolean => horaEnMadrid(ahora) === HORA_INFORME_HUMO

// ─── Qué parejas se lanzan ───────────────────────────────────────────────────

export type ParejaActiva = { compania: string; ramo: string; pausada: boolean; humoVivo: boolean }
export type ParejaHumo = { compania: string; ramo: string }
export type OmitidaHumo = ParejaHumo & { motivo: 'pausada' | 'humo_vivo' }

/**
 * De las integraciones ACTIVAS y `rpa_autorizada` (lo filtra la consulta, ordenadas por compañía y ramo: orden estable), UNA
 * prueba por COMPAÑÍA: la primera pareja activa. Varios inicios de sesión por noche con la misma credencial pueden activar
 * bloqueos de seguridad del portal. Si CUALQUIER pareja de la compañía está en PAUSA (credenciales rechazadas / fallos seguidos,
 * `tarificador_pausas`) o ya tiene un humo vivo, la compañía no se lanza esa noche (conservador: la credencial es de la compañía).
 */
export function parejasParaHumo(filas: readonly ParejaActiva[]): { lanzar: ParejaHumo[]; omitidas: OmitidaHumo[] } {
  const porCompania = new Map<string, ParejaActiva[]>()
  for (const f of filas) porCompania.set(f.compania, [...(porCompania.get(f.compania) ?? []), f])
  const lanzar: ParejaHumo[] = []
  const omitidas: OmitidaHumo[] = []
  for (const [compania, parejas] of porCompania) {
    const primera = parejas[0]
    if (parejas.some((p) => p.pausada)) omitidas.push({ compania, ramo: primera.ramo, motivo: 'pausada' })
    else if (parejas.some((p) => p.humoVivo)) omitidas.push({ compania, ramo: primera.ramo, motivo: 'humo_vivo' })
    else lanzar.push({ compania, ramo: primera.ramo })
  }
  return { lanzar, omitidas }
}

// ─── Fallo de un humo ────────────────────────────────────────────────────────

/** Un humo que falla NO se reintenta (otro login con nuestra credencial no aporta nada): `error_definitivo` siempre. */
export function estadoTrasFalloHumo(): 'error_definitivo' {
  return 'error_definitivo'
}

/** Un humo que halla las credenciales rechazadas abre la pausa de la pareja, como un trabajo de tarificar (basta uno). */
export function humoPideParar(tipoError: string | null | undefined): boolean {
  return tipoError === 'credenciales'
}

export function motivoPausaHumo(compania: string, ramo: string): string {
  return `${compania} (${ramo}): la prueba nocturna halló la contraseña rechazada o la cuenta inutilizable: actualiza CRED_…_PASS (el secreto de esa compañía) y quita la pausa.`
}

// ─── Informe ─────────────────────────────────────────────────────────────────

export type FilaHumo = {
  compania: string; ramo: string; estado: string; tipoError: string | null; mensaje: string | null
  /** Ramos con bot activo en la imagen que el worker declaró al responder (ok u omitido). `null` = no consta (fallo, o worker antiguo). */
  conBot?: readonly string[] | null
}
export type FalloHumo = { compania: string; ramo: string; motivo: string; omitida: boolean }
/** «Integración activa sin bot»: ramos activos en `companias_integracion` que la imagen del worker no tiene. */
export type SinBotHumo = { compania: string; ramos: string[] }
export type ResumenHumo = {
  /** Compañías PROBADAS (pasaron o fallaron). Un omitido por falta de bot no cuenta. */
  total: number; ok: number; fallos: FalloHumo[]; sinBot: SinBotHumo[]; omitidos: number
}

const MAX_MOTIVO = 110

/** Motivo CORTO de un fallo: sin URLs ni notas del runner, una línea, ≤110. PURO. */
export function motivoCorto(tipoError: string | null | undefined, mensaje: string | null | undefined): string {
  let m = (mensaje ?? '').replace(/^\s*(\[[^\]]{0,200}\]\s*)+/, '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim()
  if (tipoError === 'infra' && m) m = `infraestructura: ${m}`
  if (!m) m = tipoError ? `fallo (${tipoError})` : 'fallo sin detalle'
  return m.length > MAX_MOTIVO ? `${m.slice(0, MAX_MOTIVO - 1).trimEnd()}…` : m
}

/**
 * Filas de humo de la noche (más recientes primero) + las parejas ACTIVAS en la BD → qué pasó. Por pareja cuenta la más reciente.
 * `ok` = pasó. Un humo que no terminó (pendiente/en curso) cuenta como fallo: nadie ha mirado ese portal. Un humo OMITIDO por el
 * worker (sin bot activo) no cuenta como probado. «Sin bot»: de cada compañía que el worker contestó (ok u omitido) con su lista de
 * ramos con bot, los ramos ACTIVOS en la BD que no están en esa lista. Un humo omitido por credenciales de otra pareja solo se
 * lista si esa compañía no tiene ya otro fallo.
 */
export function resumirHumo(filas: readonly FilaHumo[], activas: readonly { compania: string; ramo: string }[] = []): ResumenHumo {
  const vistas = new Set<string>()
  const fallos: FalloHumo[] = []
  const conBotDe = new Map<string, readonly string[]>()
  let ok = 0
  let total = 0
  let omitidos = 0
  for (const f of filas) {
    const k = `${f.compania}/${f.ramo}`
    if (vistas.has(k)) continue
    vistas.add(k)
    if (f.conBot && !conBotDe.has(f.compania)) conBotDe.set(f.compania, f.conBot)
    // OMITIDO por el worker (sin bot activo): no se probó nada de esa compañía.
    if (f.estado === 'cancelado' && (f.mensaje ?? '').startsWith(PREFIJO_HUMO_NO_SOPORTADO)) {
      omitidos++
      continue
    }
    total++
    if (f.estado === 'ok') {
      ok++
      continue
    }
    const omitida = f.estado === 'cancelado' && (f.mensaje ?? '').startsWith('humo_omitido')
    let motivo: string
    if (omitida) motivo = 'no se probó: credenciales rechazadas en otra prueba de la compañía'
    else if ((ESTADOS_HUMO_VIVOS as readonly string[]).includes(f.estado)) motivo = 'la prueba no llegó a terminar (¿máquina sin lanzar?)'
    else motivo = motivoCorto(f.tipoError, f.mensaje)
    fallos.push({ compania: f.compania, ramo: f.ramo, motivo, omitida })
  }
  const conFalloPropio = new Set(fallos.filter((x) => !x.omitida).map((x) => x.compania))
  const sinBot: SinBotHumo[] = []
  for (const [compania, conBot] of conBotDe) {
    const ramos = [...new Set(activas.filter((a) => a.compania === compania && !conBot.includes(a.ramo)).map((a) => a.ramo))].sort()
    if (ramos.length) sinBot.push({ compania, ramos })
  }
  return { total, ok, fallos: fallos.filter((x) => !x.omitida || !conFalloPropio.has(x.compania)), sinBot, omitidos }
}

const nombre = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1) : c)

const lineasSinBot = (r: ResumenHumo) => r.sinBot.map((x) => `• <b>${escapeHtml(nombre(x.compania))}</b> (${escapeHtml(x.ramos.join(', '))}): integración activa sin bot`)

/** Texto del ÚNICO aviso a Alberto (HTML de `tgSend`, todo escapado). `null` si no falla nada ni hay integraciones sin bot. PURO. */
export function textoAvisoHumo(r: ResumenHumo): string | null {
  if (r.fallos.length === 0 && r.sinBot.length === 0) return null
  // Una línea por compañía y motivo, con sus ramos.
  const grupos = new Map<string, { compania: string; motivo: string; ramos: string[] }>()
  for (const f of r.fallos) {
    const k = `${f.compania}\u0000${f.motivo}`
    const g = grupos.get(k) ?? { compania: f.compania, motivo: f.motivo, ramos: [] }
    g.ramos.push(f.ramo)
    grupos.set(k, g)
  }
  const lineas = [
    ...[...grupos.values()].map((g) => `• <b>${escapeHtml(nombre(g.compania))}</b> (${escapeHtml([...new Set(g.ramos)].sort().join(', '))}): ${escapeHtml(g.motivo)}`),
    ...lineasSinBot(r),
  ]
  const visibles = lineas.slice(0, MAX_LINEAS_AVISO_HUMO)
  const resto = lineas.length - visibles.length
  return [
    r.fallos.length ? `🌙 <b>Prueba nocturna de los bots</b>: fallan ${r.fallos.length} de ${r.total}` : '🌙 <b>Prueba nocturna de los bots</b>: sin fallos, con avisos',
    ...visibles,
    ...(resto > 0 ? [`… y ${resto} más`] : []),
    ...(r.fallos.length ? ['Un portal ha cambiado el acceso o el menú. Revisa el bot antes de que lo use un comercial.'] : []),
  ].join('\n')
}

// ─── Silencio ≠ «todo bien» ──────────────────────────────────────────────────

export type ContextoNadaProbado = {
  rpaActivo: boolean
  esquemaHumo: boolean
  /** Compañías con integración activa y `rpa_autorizada`. */
  companiasActivas: number
  /** De ellas, las que tienen alguna pareja en pausa. */
  companiasPausadas: number
  /** Trabajos de humo de la noche (cualquier estado). */
  filas: number
  /** De ellos, omitidos por falta de bot. */
  omitidos: number
}

/** Por qué una noche termina con 0 compañías probadas. PURO; el primer motivo que casa. */
export function motivoNadaProbado(c: ContextoNadaProbado): string {
  if (!c.rpaActivo) return 'el RPA está apagado (TARIFICADOR_RPA_ACTIVO)'
  if (!c.esquemaHumo) return 'falta aplicar el SQL del humo'
  if (c.companiasActivas === 0) return 'no hay integraciones activas'
  if (c.filas === 0 && c.companiasPausadas >= c.companiasActivas) return 'todas las compañías están en pausa'
  if (c.filas === 0) return 'no se encoló ninguna prueba: ¿falló el cron de las 03:15?'
  if (c.omitidos >= c.filas) return 'ninguna compañía activa tiene bot en la imagen'
  return 'las pruebas no dieron resultado'
}

/** Aviso corto cuando no se probó NINGUNA compañía (más, si procede, las integraciones activas sin bot). PURO. */
export function textoNadaProbado(motivo: string, r?: ResumenHumo): string {
  return [`🌙 <b>Prueba nocturna</b>: no se probó nada (${escapeHtml(motivo)})`, ...(r ? lineasSinBot(r).slice(0, MAX_LINEAS_AVISO_HUMO) : [])].join('\n')
}
