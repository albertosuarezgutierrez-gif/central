// Resumen diario del canal WhatsApp por Telegram — REGLAS PURAS (sin BD; `ahora` siempre inyectado).
// Apagado por defecto: `ASEGURA_WHATSAPP_RESUMEN_ACTIVO='1'`. Sin teléfonos ni textos del cliente: solo el NOMBRE de la ficha
// y un resumen corto de lo que anotó la IA, saneado (números largos, correos y enlaces fuera).

import { escapeHtml } from '@central/core-telegram'

type Env = Record<string, string | undefined>

export const HORA_RESUMEN_MADRID = 19
/** Una conversación cuyo último mensaje es del cliente y lleva ≥ estas horas sin respuesta cuenta como «sin contestar». */
export const HORAS_SIN_CONTESTAR = 3
/** Más antiguas que esto ya no son «sin contestar» de hoy: son historia. */
export const DIAS_MAX_SIN_CONTESTAR = 7
const MAX_POR_SECCION = 8
const MAX_RESUMEN = 140

export function resumenActivo(env: Env = process.env): boolean {
  return env.ASEGURA_WHATSAPP_RESUMEN_ACTIVO === '1'
}

/** Vercel cron va en UTC: se programan las dos horas posibles (17 y 18 UTC) y solo la que es las 19 de Madrid trabaja. */
export function esHoraResumen(ahora: Date): boolean {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(ahora))
  return h === HORA_RESUMEN_MADRID
}

/** Desfase (ms) de Madrid respecto a UTC en ese instante. */
function desfaseMadrid(t: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
}

/** Instante UTC de la medianoche de Madrid de ese día civil (iterado: robusto al cambio de hora). */
function medianocheMadrid(a: number, m: number, d: number): number {
  const reloj = Date.UTC(a, m - 1, d)
  let t = reloj - desfaseMadrid(reloj)
  t = reloj - desfaseMadrid(t)
  return t
}

/** `[inicio, fin)` del día de Madrid de `ahora`, como instantes UTC. */
export function diaMadrid(ahora: Date): { inicio: Date; fin: Date } {
  const [a, m, d] = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).split('-').map(Number)
  const sig = new Date(Date.UTC(a, m - 1, d + 1))
  return { inicio: new Date(medianocheMadrid(a, m, d)), fin: new Date(medianocheMadrid(sig.getUTCFullYear(), sig.getUTCMonth() + 1, sig.getUTCDate())) }
}

/** Texto libre de la IA → algo que se puede mandar: sin números largos (teléfono/DNI/IBAN), correos ni enlaces; corto. */
export function sanearResumen(t: string | null | undefined): string | null {
  if (!t) return null
  const s = t
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\S+@\S+\.\S+/g, '')
    .replace(/\+?\d[\d\s.-]{5,}\d/g, '')
    .replace(/\b[A-Za-z]\d{7,8}[A-Za-z]\b|\b\d{8}[A-Za-z]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  return s.length > MAX_RESUMEN ? `${s.slice(0, MAX_RESUMEN - 1).trimEnd()}…` : s
}

export type ConversacionDia = {
  nombre: string | null
  entrantes: number
  salientesIa: number
  ultimaDireccion: 'entrante' | 'saliente' | null
  ultimoAt: Date | null
  intencion: string | null
  riesgoAbandono: string | null
  resumen: string | null
  /** Acciones de la IA aplicadas (propias o propuestas) en el último análisis. */
  accionesAplicadas: number
}

export type PropuestaPendiente = { nombre: string | null; tipo: string }

export type DatosResumen = {
  ahora: Date
  /** Conversaciones con ficha y actividad HOY. */
  hoy: ConversacionDia[]
  /** Conversaciones con ficha cuyo último mensaje es del cliente, sin contestar (cualquier día de los últimos 7). */
  sinContestar: ConversacionDia[]
  /** `null` = no se pudo leer (tabla/migración): se dice «sin leer», nunca «0». */
  propuestas: PropuestaPendiente[] | null
}

const TIPO_PROPUESTA: Record<string, string> = { fecha_cobro: 'fecha de cobro', pagado: 'marcar pagado', vencimiento: 'vencimiento' }

export function esQueja(c: Pick<ConversacionDia, 'intencion' | 'riesgoAbandono'>): boolean {
  return c.intencion === 'queja' || c.riesgoAbandono === 'alto'
}

/** ¿Lleva esta conversación ≥ HORAS_SIN_CONTESTAR esperando (y ≤ 7 días)? */
export function estaSinContestar(c: Pick<ConversacionDia, 'ultimaDireccion' | 'ultimoAt'>, ahora: Date): boolean {
  if (c.ultimaDireccion !== 'entrante' || !c.ultimoAt) return false
  const h = (ahora.getTime() - c.ultimoAt.getTime()) / 3_600_000
  return h >= HORAS_SIN_CONTESTAR && h <= DIAS_MAX_SIN_CONTESTAR * 24
}

const nombre = (n: string | null) => escapeHtml((n ?? '').trim().slice(0, 60) || 'Ficha sin nombre')

function lista(titulo: string, filas: string[]): string[] {
  if (filas.length === 0) return []
  const l = [`\n<b>${titulo}</b> (${filas.length})`, ...filas.slice(0, MAX_POR_SECCION).map((f) => `• ${f}`)]
  if (filas.length > MAX_POR_SECCION) l.push(`… y ${filas.length - MAX_POR_SECCION} más`)
  return l
}

/** `null` si no hay nada que contar (no se manda un resumen vacío). */
export function textoResumenDiario(d: DatosResumen): string | null {
  const con = d.hoy.filter((c) => c.entrantes > 0 || c.salientesIa > 0)
  const quejas = d.hoy.filter(esQueja)
  const sinContestar = d.sinContestar.filter((c) => estaSinContestar(c, d.ahora))
  const nada = con.length === 0 && quejas.length === 0 && sinContestar.length === 0 && (d.propuestas?.length ?? 0) === 0
  if (nada) return null
  const fecha = d.ahora.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
  const l = [`🌆 <b>WhatsApp · resumen del día</b> · ${fecha}`]
  l.push(`Hoy: ${con.length} conversación(es) con ficha · ${con.reduce((n, c) => n + c.entrantes, 0)} mensaje(s) recibido(s) · ${con.reduce((n, c) => n + c.salientesIa, 0)} enviado(s) por la IA`)
  l.push(...lista('Con quién se habló y qué anotó la IA', con.map((c) => {
    const r = sanearResumen(c.resumen)
    const extra = [c.intencion ? c.intencion.replace(/_/g, ' ') : null, c.accionesAplicadas > 0 ? `${c.accionesAplicadas} acción(es)` : null].filter(Boolean).join(' · ')
    return `${nombre(c.nombre)}${extra ? ` (${escapeHtml(extra)})` : ''}${r ? ` — ${escapeHtml(r)}` : ''}`
  })))
  if (d.propuestas === null) l.push('\n⚠️ Propuestas esperando ✅: sin leer (falta la migración o falló la lectura).')
  else l.push(...lista('✅ Propuestas esperando tu botón', d.propuestas.map((p) => `${nombre(p.nombre)} · ${escapeHtml(TIPO_PROPUESTA[p.tipo] ?? p.tipo)}`)))
  l.push(...lista('😠 Queja o riesgo de abandono', quejas.map((c) => `${nombre(c.nombre)}${c.intencion === 'queja' ? ' · queja' : ''}${c.riesgoAbandono === 'alto' ? ' · riesgo alto' : ''}`)))
  l.push(...lista('⏳ Sin contestar', sinContestar.map((c) => {
    const h = Math.floor((d.ahora.getTime() - (c.ultimoAt as Date).getTime()) / 3_600_000)
    return `${nombre(c.nombre)} · hace ${h >= 48 ? `${Math.floor(h / 24)} días` : `${h} h`}`
  })))
  return l.join('\n')
}
