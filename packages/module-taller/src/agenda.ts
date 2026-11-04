// Motor de huecos por CAPACIDAD (spec «Citas por enlace y agenda con capacidad»). PURO: sin BD, con `ahora` inyectado.
//
// No planifica mecánico a mecánico. Una franja de ENTRADA se ofrece si (1) aún caben coches en ella y (2) el día tiene
// horas-mecánico libres para el servicio:
//
//   capacidad del día  = puestos × minutos de horario de ese día × % ocupable
//   ocupado del día    = trabajo PENDIENTE de las OT abiertas (repartido desde hoy, día a día, hasta llenar cada capacidad)
//                      + duración de las citas `pedida`/`confirmada` de ese día
//   se ofrece la franja si  capacidad − ocupado ≥ duración del servicio (baremo + margen)  y  coches(franja) < máx. por franja
//
// Nunca ofrece franjas pasadas, fuera del horario semanal, en días de cierre ni fuera de la antelación mínima/máxima.
// Toda cifra sale de `ConfigTaller` (guardián de literales).
import { PUNTOS_BASICOS_100, SERVICIO_DIAGNOSTICO, type ConfigTaller } from './config.ts'


/** Espejo de `taller.citas.estado` (cepo en apps/taller/test/esquema-sql.test.ts). */
export const ESTADOS_CITA = ['pedida', 'confirmada', 'cancelada', 'realizada', 'no_presentado'] as const
export type EstadoCita = (typeof ESTADOS_CITA)[number]
/** Las únicas que gastan hueco y capacidad: una cancelada, realizada (ya es OT) o no presentada no cuenta. */
export const ESTADOS_CITA_OCUPAN: readonly string[] = ['pedida', 'confirmada']

const MIN_MS = 60_000
const HORA_MS = 60 * MIN_MS
const DIA_MS = 24 * HORA_MS
/** Tope de seguridad de los bucles por día (un año). */
const MAX_DIAS_BUCLE = 366

export interface CitaAgenda {
  inicio: Date
  /** Minutos que la cita gasta de capacidad (YA con el margen, tal como se guardó al reservar). */
  duracionMinutos: number
  estado: string
}

/** Trabajo pendiente de una OT abierta. `null` = no se sabe (OT sin baremo): se cuenta como un diagnóstico, nunca como 0. */
export interface OtAbierta {
  minutosPendientes: number | null
}

export interface Existentes {
  citas: readonly CitaAgenda[]
  ots: readonly OtAbierta[]
}

export interface Hueco {
  inicio: Date
  /** Fecha local 'AAAA-MM-DD'. */
  fecha: string
  /** Hora local 'HH:MM'. */
  hora: string
  plazasLibres: number
  /** Minutos de capacidad que le quedan al día (antes de reservar este servicio). */
  capacidadRestanteMin: number
}

export interface OpcionesHuecos {
  /** El taller mueve/crea citas a mano: sin antelación mínima ni máxima. El pasado sigue sin ofrecerse. */
  comoTaller?: boolean
}

// ── Fechas locales (sin dependencias) ────────────────────────────────────────
export function fechaLocal(d: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split('T')[0]
}

/** 0 = domingo … 6 = sábado, de una fecha 'AAAA-MM-DD'. */
export function diaSemanaDe(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function desfaseMs(instante: Date, zona: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante)
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  const comoUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/** Instante UTC de «fecha + hora» en la zona del taller (respeta el cambio de hora). */
export function instanteLocal(fecha: string, hhmm: string, zona: string): Date {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const ingenuo = Date.UTC(y, m - 1, d, h, mi)
  const primero = ingenuo - desfaseMs(new Date(ingenuo), zona)
  return new Date(ingenuo - desfaseMs(new Date(primero), zona))
}

export function horaLocal(d: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zona, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(d)
}

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const aHhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ── Capacidad y servicios ────────────────────────────────────────────────────
const cerrado = (c: ConfigTaller, fecha: string) => c.agenda.cierres.some((x) => x.fecha === fecha)

/** Minutos de horario de ese día (suma de franjas). 0 si es un cierre o el taller no abre ese día de la semana. */
export function minutosHorarioDia(c: ConfigTaller, fecha: string): number {
  if (cerrado(c, fecha)) return 0
  const dia = diaSemanaDe(fecha)
  return c.horarioCitas.franjas.filter((f) => f.diaSemana === dia).reduce((s, f) => s + (aMinutos(f.hasta) - aMinutos(f.desde)), 0)
}

/** Capacidad del día en minutos-mecánico: puestos × horario × % ocupable (redondeo hacia abajo: nunca se promete de más). */
export function capacidadDiaMinutos(c: ConfigTaller, fecha: string): number {
  return Math.floor((c.horarioCitas.puestos * minutosHorarioDia(c, fecha) * c.agenda.ocupablePuntosBasicos) / PUNTOS_BASICOS_100)
}

/** Minutos que gasta un servicio (baremo del paquete o diagnóstico, MÁS el margen). null = servicio desconocido, inactivo o sin baremo. */
export function duracionServicio(c: ConfigTaller, servicio: string): number | null {
  const margen = c.agenda.margenEntreTrabajosMinutos
  if (servicio === SERVICIO_DIAGNOSTICO) return c.agenda.duracionDiagnosticoMinutos + margen
  const p = c.paquetes.find((x) => x.codigo === servicio && x.activo)
  return p && p.baremoMinutos > 0 ? p.baremoMinutos + margen : null
}

/**
 * Minutos pendientes de una OT: baremo de sus líneas − lo ya trabajado. null si ninguna línea trae baremo (no se sabe;
 * el motor lo cuenta como un diagnóstico).
 */
export function minutosPendientesOt(baremos: ReadonlyArray<number | null | undefined>, trabajadosMin: number): number | null {
  const conBaremo = baremos.filter((b): b is number => typeof b === 'number' && b >= 0)
  if (conBaremo.length === 0) return null
  return Math.max(0, conBaremo.reduce((s, b) => s + b, 0) - Math.max(0, trabajadosMin))
}

/** Reparto del trabajo pendiente de las OT abiertas por día: desde `desde` (hoy), llenando la capacidad de cada día en orden. */
export function repartoOts(c: ConfigTaller, ots: readonly OtAbierta[], desde: string, hasta: string): Map<string, number> {
  const reparto = new Map<string, number>()
  let pendiente = ots.reduce((s, o) => s + (o.minutosPendientes ?? c.agenda.duracionDiagnosticoMinutos), 0)
  let fecha = desde
  for (let i = 0; i < MAX_DIAS_BUCLE && pendiente > 0 && fecha <= hasta; i++, fecha = sumarDias(fecha, 1)) {
    const cap = capacidadDiaMinutos(c, fecha)
    if (cap <= 0) continue
    const toma = Math.min(cap, pendiente)
    reparto.set(fecha, toma)
    pendiente -= toma
  }
  return reparto
}

// ── Franjas de entrada del día ───────────────────────────────────────────────
export interface FranjaEntrada {
  inicio: Date
  hora: string
}

/** Franjas de entrada del día: dentro de cada tramo del horario, cada `duracionHuecoMinutos`; la última debe caber entera. */
export function franjasDelDia(c: ConfigTaller, fecha: string): FranjaEntrada[] {
  if (cerrado(c, fecha)) return []
  const paso = c.horarioCitas.duracionHuecoMinutos
  const dia = diaSemanaDe(fecha)
  const out: FranjaEntrada[] = []
  for (const f of c.horarioCitas.franjas.filter((x) => x.diaSemana === dia).sort((a, b) => a.desde.localeCompare(b.desde))) {
    for (let t = aMinutos(f.desde); t + paso <= aMinutos(f.hasta); t += paso) {
      out.push({ inicio: instanteLocal(fecha, aHhmm(t), c.agenda.zonaHoraria), hora: aHhmm(t) })
    }
  }
  return out
}

const ocupan = (citas: readonly CitaAgenda[]) => citas.filter((x) => ESTADOS_CITA_OCUPAN.includes(x.estado))

// ── Ocupación de un día (agenda del taller) ──────────────────────────────────
export interface OcupacionFranja {
  inicio: Date
  hora: string
  coches: number
  maxCoches: number
  llena: boolean
}

export interface OcupacionDia {
  fecha: string
  capacidadMin: number
  otsMin: number
  citasMin: number
  ocupadoMin: number
  /** % redondeado del día ocupado; null si el día no tiene capacidad (cerrado o sin horario): no se inventa un 0 %. */
  porcentaje: number | null
  /** Se pasa de la capacidad (o hay trabajo en un día sin capacidad). Va en rojo. */
  saturado: boolean
  franjas: OcupacionFranja[]
}

export function ocupacionDia(c: ConfigTaller, ex: Existentes, fecha: string, ahora: Date): OcupacionDia {
  const zona = c.agenda.zonaHoraria
  const hoy = fechaLocal(ahora, zona)
  const capacidadMin = capacidadDiaMinutos(c, fecha)
  const otsMin = fecha >= hoy ? (repartoOts(c, ex.ots, hoy, fecha).get(fecha) ?? 0) : 0
  const delDia = ocupan(ex.citas).filter((x) => fechaLocal(x.inicio, zona) === fecha)
  const citasMin = delDia.reduce((s, x) => s + x.duracionMinutos, 0)
  const ocupadoMin = otsMin + citasMin
  const paso = c.horarioCitas.duracionHuecoMinutos * MIN_MS
  const franjas = franjasDelDia(c, fecha).map((f) => {
    const coches = delDia.filter((x) => x.inicio.getTime() >= f.inicio.getTime() && x.inicio.getTime() < f.inicio.getTime() + paso).length
    return { inicio: f.inicio, hora: f.hora, coches, maxCoches: c.agenda.maxCochesPorFranja, llena: coches >= c.agenda.maxCochesPorFranja }
  })
  return {
    fecha, capacidadMin, otsMin, citasMin, ocupadoMin,
    porcentaje: capacidadMin > 0 ? Math.round((ocupadoMin * 100) / capacidadMin) : null,
    saturado: ocupadoMin > capacidadMin,
    franjas,
  }
}

// ── Huecos ───────────────────────────────────────────────────────────────────
/**
 * Franjas de entrada ofrecibles para `servicio` entre `desde` y `hasta` (ambos incluidos). Servicio desconocido → [].
 * `ahora` se inyecta: nunca se lee el reloj.
 */
export function huecosDisponibles(
  c: ConfigTaller, ex: Existentes, servicio: string, desde: Date, hasta: Date, ahora: Date, opciones: OpcionesHuecos = {},
): Hueco[] {
  const dur = duracionServicio(c, servicio)
  if (dur === null || c.horarioCitas.franjas.length === 0) return []
  const zona = c.agenda.zonaHoraria
  const t0 = opciones.comoTaller ? ahora.getTime() : ahora.getTime() + c.agenda.antelacionMinimaHoras * HORA_MS
  const tope = opciones.comoTaller ? Number.POSITIVE_INFINITY : ahora.getTime() + c.agenda.antelacionMaximaDias * DIA_MS
  const inicioVentana = Math.max(desde.getTime(), t0)
  const finVentana = Math.min(hasta.getTime(), tope)
  if (finVentana < inicioVentana) return []

  const hoy = fechaLocal(ahora, zona)
  const primero = fechaLocal(new Date(inicioVentana), zona)
  const ultimo = fechaLocal(new Date(finVentana), zona)
  const out: Hueco[] = []
  let fecha = primero
  for (let i = 0; i < MAX_DIAS_BUCLE && fecha <= ultimo; i++, fecha = sumarDias(fecha, 1)) {
    if (fecha < hoy) continue
    const oc = ocupacionDia(c, ex, fecha, ahora)
    const restante = oc.capacidadMin - oc.ocupadoMin
    if (restante < dur) continue
    for (const f of oc.franjas) {
      const t = f.inicio.getTime()
      if (t < inicioVentana || t > finVentana || f.llena) continue
      out.push({ inicio: f.inicio, fecha, hora: f.hora, plazasLibres: f.maxCoches - f.coches, capacidadRestanteMin: restante })
    }
  }
  return out
}

export type MotivoReservaNoValida = 'servicio_desconocido' | 'hueco_no_disponible'
export type ResultadoReserva = { ok: true; duracionMinutos: number } | { ok: false; motivo: MotivoReservaNoValida }

/**
 * ¿Sigue libre ESTA franja para ESTE servicio? Es la comprobación que se repite DENTRO de la transacción que reserva
 * (con el candado del taller y las citas recién leídas): lo que se vio en pantalla hace un minuto no vale.
 */
export function comprobarReserva(
  c: ConfigTaller, ex: Existentes, servicio: string, inicio: Date, ahora: Date, opciones: OpcionesHuecos = {},
): ResultadoReserva {
  const dur = duracionServicio(c, servicio)
  if (dur === null) return { ok: false, motivo: 'servicio_desconocido' }
  const h = huecosDisponibles(c, ex, servicio, inicio, inicio, ahora, opciones)
  return h.some((x) => x.inicio.getTime() === inicio.getTime()) ? { ok: true, duracionMinutos: dur } : { ok: false, motivo: 'hueco_no_disponible' }
}

/** Estado con el que entra una cita pedida por el cliente según la política del taller. */
export const estadoCitaAlPedir = (c: ConfigTaller): EstadoCita => (c.agenda.confirmacion === 'automatica' ? 'confirmada' : 'pedida')
