// UNA sola regla para toda OPORTUNIDAD (Alberto, 29/09/2026): un seguro que NO está con nosotros y
// cuyo vencimiento conocemos —venga de una baja por recibo devuelto, de un alta por Telegram, de un
// lead de competencia, de la recaptación, del «avísame» de la web o de una póliza subida— genera el
// aviso/tarea a Alberto 45 días antes de ese vencimiento. Antes de eso NO se contacta al cliente, y a
// un cliente propio nunca se le manda precio por adelantado.
//
// Hasta hoy convivían 60, 45 y 70 tecleados en cada fichero; ahora todos leen DIAS_AVISO_OPORTUNIDAD.
// El guardián `test/regression-oportunidad-45.test.ts` falla si alguien vuelve a teclear el número.
//
// ⚠️ NO confundir con `DIAS_PREAVISO_ASEGURADOR` (60, `vencimientos.ts`): ese es el plazo LEGAL de la
// compañía (art. 22 LCS) sobre las pólizas propias, no cuándo se trabaja una oportunidad.
//
// Puro (sin BD ni red): `node --test`.

import type { EstadoOportunidad } from './oportunidad-seguimiento.ts'

/** Días antes del vencimiento en que una oportunidad pasa a Alberto (y no antes se contacta a nadie). */
export const DIAS_AVISO_OPORTUNIDAD = 45

/** Estados en los que la oportunidad sigue viva; `ganada`/`perdida` no se avisan. */
export const ESTADOS_OPORTUNIDAD_ABIERTA: readonly EstadoOportunidad[] = ['competencia', 'en_negociacion', 'pendiente_cliente']

const ISO = /^\d{4}-\d{2}-\d{2}$/

function valida(s: string | null | undefined): string | null {
  if (typeof s !== 'string' || !ISO.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días naturales de `desde` a `hasta` (ISO), negativo si `hasta` es anterior. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/**
 * Qué día toca el primer paso de una oportunidad: {@link DIAS_AVISO_OPORTUNIDAD} días antes de su
 * vencimiento, nunca antes de mañana. Sin vencimiento legible, mañana (hay que pedirlo).
 */
export function fechaAvisoOportunidad(vence: string | null | undefined, hoy: string): string {
  const manana = sumarDias(hoy, 1)
  const v = valida(vence)
  if (!v) return manana
  const antes = sumarDias(v, -DIAS_AVISO_OPORTUNIDAD)
  return antes > manana ? antes : manana
}

/**
 * El vencimiento del CICLO en curso: los seguros se renuevan cada año, así que una fecha pasada se
 * corre de año en año hasta hoy o después (29/02 → 28/02). `null` si la fecha no se puede leer: no se
 * inventa un día.
 */
export function vencimientoDelCiclo(fecha: string | null | undefined, hoy: string): string | null {
  const f = valida(fecha)
  if (!f) return null
  const [a, m, d] = f.split('-').map(Number)
  for (let n = 0; n <= 30; n++) {
    const dia = Math.min(d, new Date(Date.UTC(a + n, m, 0)).getUTCDate())
    const iso = `${a + n}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (iso >= hoy) return iso
  }
  return null
}

export type OportunidadParaAviso = {
  id: string
  estado: string
  fechaFinVigencia: string | null
  /** Aparcada por Alberto hasta ese día: mientras dure, no suena. */
  aparcadaHasta: string | null
}

export type AvisoOportunidad = { id: string; vence: string; dias: number }

/**
 * Qué oportunidades entran HOY en el aviso de 45 días: abiertas, con vencimiento conocido, a
 * ≤ {@link DIAS_AVISO_OPORTUNIDAD} días de su vencimiento del ciclo, no aparcadas y sin aviso previo
 * para ESE vencimiento. `yaAvisadas` son claves `id|vence` (ver {@link claveAvisoOportunidad}): un aviso
 * por oportunidad y ciclo, y el ciclo siguiente vuelve a sonar.
 */
export function avisosOportunidadDeHoy(
  ops: readonly OportunidadParaAviso[],
  yaAvisadas: ReadonlySet<string>,
  hoy: string,
): AvisoOportunidad[] {
  const out: AvisoOportunidad[] = []
  for (const o of ops) {
    if (!(ESTADOS_OPORTUNIDAD_ABIERTA as readonly string[]).includes(o.estado)) continue
    const aparcada = valida(o.aparcadaHasta)
    if (aparcada && aparcada > hoy) continue
    const vence = vencimientoDelCiclo(o.fechaFinVigencia, hoy)
    if (!vence) continue
    const dias = diasEntre(hoy, vence)
    if (dias > DIAS_AVISO_OPORTUNIDAD) continue
    if (yaAvisadas.has(claveAvisoOportunidad(o.id, vence))) continue
    out.push({ id: o.id, vence, dias })
  }
  return out.sort((a, b) => a.dias - b.dias)
}

export function claveAvisoOportunidad(id: string, vence: string): string {
  return `${id}|${vence}`
}

export type PlanTareaVencimiento =
  | { accion: 'nada'; motivo: 'sin_vencimiento' | 'ya_esta' }
  | { accion: 'crear'; fecha: string }
  | { accion: 'mover'; tareaId: string; desde: string; fecha: string }

/**
 * Al corregir el vencimiento de una oportunidad abierta (29/09/2026: el escaneo o el volcado lo
 * traían mal), dónde queda su próxima tarea: {@link DIAS_AVISO_OPORTUNIDAD} días antes del
 * vencimiento del ciclo, nunca antes de mañana. Sin tarea pendiente se crea (si no, la tarjeta
 * dice «Sin próximo paso» y nadie la mueve); con una, se MUEVE — no se cierra: una llamada
 * cerrada cuenta como intento y falsearía el plan de llamadas.
 */
export function planTareaTrasVencimiento(
  vence: string | null | undefined,
  proxima: { id: string; fecha: string } | null,
  hoy: string,
): PlanTareaVencimiento {
  const ciclo = vencimientoDelCiclo(vence, hoy)
  if (!ciclo) return { accion: 'nada', motivo: 'sin_vencimiento' }
  const fecha = fechaAvisoOportunidad(ciclo, hoy)
  if (!proxima) return { accion: 'crear', fecha }
  if (proxima.fecha === fecha) return { accion: 'nada', motivo: 'ya_esta' }
  return { accion: 'mover', tareaId: proxima.id, desde: proxima.fecha, fecha }
}

export type PlanLlamadaAnual =
  | { accion: 'nada'; motivo: 'no_es_llamada' | 'no_abierta' | 'aparcada' | 'sin_vencimiento' | 'ya_hay_anual' }
  | { accion: 'crear'; fecha: string; vence: string }

/**
 * Recurrencia anual de la llamada de seguimiento (06/10/2026): al COMPLETAR una llamada de una
 * oportunidad que sigue abierta y sin otra tarea pendiente, se deja la del ciclo siguiente. El
 * vencimiento es un aniversario (día+mes), así que si el aviso del ciclo en curso ya pasó (la llamada
 * que se cierra ERA la de este ciclo) el objetivo es el vencimiento del año que viene; si aún no ha
 * llegado (se llamó antes de tiempo) la tarea sigue siendo la de este ciclo. La fecha la da la misma
 * regla de siempre ({@link fechaAvisoOportunidad}: 45 días antes, nunca antes de mañana).
 * Idempotente (07/10/2026): no crea si YA hay una llamada pendiente con fecha ≥ la que se crearía
 * (`ultimaLlamadaPendiente` = la fecha MÁS LEJANA entre las llamadas pendientes). Se compara contra la fecha
 * calculada, no contra «0 pendientes», para que los reintentos de «no contesta» / «otro día» (fechas
 * cercanas, < fecha del aviso) convivan con la anual sin duplicarla, y un segundo cierre no cree otra.
 * Una pendiente lejana ≥ fecha es la propia anual (o equivale a ella: llamada ya puesta junto al aviso).
 */
export function planLlamadaAnual(p: {
  tipoTareaCerrada: string | null | undefined
  estado: string
  aparcadaHasta: string | null | undefined
  fechaFinVigencia: string | null | undefined
  /** Fecha límite (aaaa-mm-dd) más lejana entre las LLAMADAS aún pendientes de la oportunidad (sin la que se acaba de cerrar); `null` = ninguna. */
  ultimaLlamadaPendiente: string | null
  hoy: string
}): PlanLlamadaAnual {
  if (p.tipoTareaCerrada !== 'llamada') return { accion: 'nada', motivo: 'no_es_llamada' }
  if (!(ESTADOS_OPORTUNIDAD_ABIERTA as readonly string[]).includes(p.estado)) return { accion: 'nada', motivo: 'no_abierta' }
  const aparcada = valida(p.aparcadaHasta)
  if (aparcada && aparcada > p.hoy) return { accion: 'nada', motivo: 'aparcada' }
  const ciclo = vencimientoDelCiclo(p.fechaFinVigencia, p.hoy)
  if (!ciclo) return { accion: 'nada', motivo: 'sin_vencimiento' }
  const objetivo = sumarDias(ciclo, -DIAS_AVISO_OPORTUNIDAD) > p.hoy ? ciclo : vencimientoDelCiclo(p.fechaFinVigencia, sumarDias(ciclo, 1))
  if (!objetivo) return { accion: 'nada', motivo: 'sin_vencimiento' }
  const fecha = fechaAvisoOportunidad(objetivo, p.hoy)
  const ultima = valida(p.ultimaLlamadaPendiente)
  if (ultima && ultima >= fecha) return { accion: 'nada', motivo: 'ya_hay_anual' }
  return { accion: 'crear', fecha, vence: objetivo }
}

/** Más allá de esto un vencimiento no es de la póliza en curso: un seguro anual renueva cada año. */
export const MESES_VENCIMIENTO_MAX = 13

export type FechaDudosa = { motivo: 'pasada' | 'lejana'; texto: string }

/**
 * Un vencimiento que no cuadra, leído de un documento o tecleado (30/09/2026, «por si se escanea mal»): ya pasado
 * (la póliza del documento es vieja o se leyó mal el año) o a más de {@link MESES_VENCIMIENTO_MAX}
 * meses. `null` = cuadra, o no hay fecha legible (eso es «sin fecha», otra cosa). No corrige nada:
 * solo dice que hay que mirarla antes de dar la llamada por buena.
 */
export function fechaVencimientoDudosa(fecha: string | null | undefined, hoy: string): FechaDudosa | null {
  const f = valida(fecha)
  const h = valida(hoy)
  if (!f || !h) return null
  const dd = `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
  if (f < h) return { motivo: 'pasada', texto: `El vencimiento (${dd}) ya ha pasado: compruébalo con el cliente o con la póliza.` }
  const [a, m, d] = h.split('-').map(Number)
  const tope = new Date(Date.UTC(a, m - 1 + MESES_VENCIMIENTO_MAX, 1))
  tope.setUTCDate(Math.min(d, new Date(Date.UTC(tope.getUTCFullYear(), tope.getUTCMonth() + 1, 0)).getUTCDate()))
  if (f > tope.toISOString().slice(0, 10)) return { motivo: 'lejana', texto: `El vencimiento (${dd}) está a más de ${MESES_VENCIMIENTO_MAX} meses: seguramente es otro año, compruébalo.` }
  return null
}

export type EstadoAvisoVencimiento =
  | { estado: 'desconocido'; texto: string }
  | { estado: 'programado'; vence: string; fechaAviso: string; texto: string }
  | { estado: 'en_ventana'; vence: string; dias: number; texto: string }

const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Día + mes en español de una fecha ISO, SIN año («2026-06-01» → «1 de junio»). El vencimiento de una
 * oportunidad es un aniversario anual: el año no es un dato del seguro, así que no se enseña.
 */
export function diaMesEs(iso: string): string {
  const m = Number(iso.slice(5, 7))
  return `${Number(iso.slice(8, 10))} de ${MESES_ES[m - 1] ?? ''}`.trim()
}

/**
 * Qué pasa con el aviso de una oportunidad (03/10/2026): sin vencimiento, NO se avisa y se dice
 * («vencimiento desconocido», no «sin aviso» a secas); con él, el aviso sale
 * {@link DIAS_AVISO_OPORTUNIDAD} días antes (preaviso de un mes del tomador) o ya está en ventana.
 */
export function estadoAvisoVencimiento(fecha: string | null | undefined, hoy: string): EstadoAvisoVencimiento {
  const vence = vencimientoDelCiclo(fecha, hoy)
  if (!vence) return { estado: 'desconocido', texto: 'Vencimiento desconocido: no se avisa. Pídeselo al cliente.' }
  const dias = diasEntre(hoy, vence)
  if (dias <= DIAS_AVISO_OPORTUNIDAD) {
    return { estado: 'en_ventana', vence, dias, texto: `Vence cada año el ${diaMesEs(vence)} (${dias} d): ya toca avisarle.` }
  }
  const fechaAviso = sumarDias(vence, -DIAS_AVISO_OPORTUNIDAD)
  return { estado: 'programado', vence, fechaAviso, texto: `Vence cada año el ${diaMesEs(vence)}: te aviso el ${fechaEs(fechaAviso)} (${DIAS_AVISO_OPORTUNIDAD} días antes).` }
}
