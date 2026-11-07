/**
 * N2 — Fichajes → PROPUESTAS de incidencias (horas extra, ausencias, retrasos). PURO: sin BD ni reloj propio.
 *
 * Regla de oro: SUGIERE, no entra sola. Esta función solo devuelve propuestas; el responsable las aprueba una a una
 * y solo entonces se convierten en `incidencias_mes` (apps/rrhh). Fail-closed y «dato que no hay ≠ dato que no se ha mirado»:
 *  - solo cuentan fichajes APROBADOS y CERRADOS (con salida); los demás se cuentan en `avisos`, no se computan;
 *  - un fichaje de otra empresa u otro empleado es un error (aislamiento por código), no se descarta en silencio;
 *  - el mes debe estar cerrado (anterior al mes de `hoy`, inyectado: nunca reloj real);
 *  - convenio sin jornada diaria (`null`) = no se sabe → no se propone NINGUNA hora extra (ni se inventa una jornada);
 *  - sin calendario previsto (`diasPrevistos` null) no se proponen ausencias;
 *  - tope anual 80 h (art. 35.2 ET): las compensadas con descanso NO cuentan; el acumulado previo `null` = «no comprobado» (aviso).
 *  - contrato a tiempo parcial: lo que exceda es «hora complementaria» (art. 12 ET), no extra → solo aviso.
 */
import type { IncidenciaMes, TipoContrato } from './tipos'

export const TOPE_EXTRA_ANUAL_ET = 80
const TZ = 'Europe/Madrid'
const MS_MIN = 60_000

export type SubtipoExtra = 'diurna' | 'nocturna' | 'festiva'
export type TipoPropuesta = 'horas_extra' | 'horas_extra_compensada' | 'ausencia' | 'retraso'

export interface FichajeNomina {
  id: string
  empresaId: string
  empleadoId: string
  entradaAt: string
  salidaAt: string | null
  /** Aprobado por el responsable (rrhh.fichajes.aprobado_at no nulo). */
  aprobado: boolean
}

export interface ContratoHorario {
  empresaId: string
  empleadoId: string
  tipoContrato: TipoContrato
  jornadaPct: number
}

export interface ConvenioHorario {
  /** Horas ordinarias por día con jornada completa. null = el convenio no lo dice → no se proponen extras. */
  horasDiariasOrdinarias: number | null
  /** 'HH:MM' de entrada prevista. null = no se sabe → sin retrasos. */
  horaEntradaPrevista: string | null
  toleranciaRetrasoMin: number
  /** Festivos AAAA-MM-DD (nacionales + autonómicos + locales de la empresa). */
  festivos: readonly string[]
  /** 'descanso' = las extra se compensan con descanso (no se pagan). null = no se sabe. */
  compensacionExtras: 'pago' | 'descanso' | null
  /** Tope propio del convenio; nunca por encima de 80. */
  topeExtraAnual: number | null
  /** Días de la semana laborables (1 = lunes … 7 = domingo). null = no se sabe → no se calcula calendario previsto. */
  diasSemana: readonly number[] | null
}

export interface OpcionesFichajes {
  /** AAAA-MM */
  periodo: string
  /** AAAA-MM-DD de «hoy», inyectado. */
  hoy: string
  /** Días en que debía trabajar (AAAA-MM-DD). null = no se sabe → sin ausencias. */
  diasPrevistos: readonly string[] | null
  /** Días con ausencia justificada (vacaciones/permiso/baja aprobados). */
  diasJustificados?: readonly string[]
  /** Horas extra pagadas ya en el año (meses anteriores, sin compensadas). null = no comprobado. */
  horasExtraAnioPrevias: number | null
}

export interface PropuestaIncidencia {
  /** Estable (mismo fichajes → misma clave): sirve para idempotencia al aprobar. */
  clave: string
  tipo: TipoPropuesta
  subtipo?: SubtipoExtra
  fecha: string
  horas?: number
  dias?: number
  minutos?: number
  fichajeIds: string[]
  concepto: string
  /** Lo que entraría en la nómina al aprobar. null = informativa (retraso) o compensada con descanso. */
  incidencia: IncidenciaMes | null
  superaTope: boolean
}

export interface ResultadoFichajes {
  periodo: string
  propuestas: PropuestaIncidencia[]
  avisos: string[]
  horasExtraPagoMes: number
  horasExtraCompensadasMes: number
  /** Previas + mes (pago). null = no se pudo comprobar el acumulado. */
  horasExtraAnio: number | null
  topeAnual: number
  superaTope: boolean | null
  fichajesSinAprobar: number
  fichajesAbiertos: number
}

export class MesNoCerradoError extends Error {
  constructor(periodo: string) { super(`El mes ${periodo} no está cerrado: no se proponen incidencias desde fichajes`); this.name = 'MesNoCerradoError' }
}
export class FichajeAjenoError extends Error {
  constructor(motivo: string) { super(`Fichaje ajeno al contrato (${motivo}): se aborta, el aislamiento por empresa/empleado no se negocia`); this.name = 'FichajeAjenoError' }
}

// ── Convenio ────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const hhmm = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null)

/** Lee `convenio_datos.horario` (estructura explícita; el texto libre del agente de convenios NO se interpreta). Todo lo ausente = null. */
export function parseConvenioHorario(convenioDatos: unknown): ConvenioHorario {
  const h = ((convenioDatos as { horario?: unknown } | null)?.horario ?? {}) as Record<string, unknown>
  const horas = num(h.horas_diarias)
  const festivos = Array.isArray(h.festivos) ? h.festivos.filter((f): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)) : []
  return {
    horasDiariasOrdinarias: horas !== null && horas > 0 && horas <= 24 ? horas : null,
    horaEntradaPrevista: hhmm(h.hora_entrada),
    toleranciaRetrasoMin: num(h.tolerancia_retraso_min) ?? 0,
    festivos,
    compensacionExtras: h.compensacion_extras === 'pago' || h.compensacion_extras === 'descanso' ? h.compensacion_extras : null,
    topeExtraAnual: num(h.tope_extra_anual),
    diasSemana: Array.isArray(h.dias_semana) && h.dias_semana.length > 0 && h.dias_semana.every(d => Number.isInteger(d) && d >= 1 && d <= 7)
      ? [...new Set(h.dias_semana as number[])].sort() : null,
  }
}

/** Días del mes en que se debía trabajar según el convenio (días de la semana menos festivos). null = sin `diasSemana` → «no se sabe». */
export function diasPrevistosDelMes(periodo: string, convenio: Pick<ConvenioHorario, 'diasSemana' | 'festivos'>): string[] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`Período inválido: ${periodo}`)
  if (!convenio.diasSemana) return null
  const total = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  const festivos = new Set(convenio.festivos)
  const out: string[] = []
  for (let d = 1; d <= total; d++) {
    const fecha = `${periodo}-${String(d).padStart(2, '0')}`
    const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, d)).getUTCDay() || 7
    if (convenio.diasSemana.includes(dow) && !festivos.has(fecha)) out.push(fecha)
  }
  return out
}

// ── Tiempo local (Europe/Madrid) ────────────────────────────────────────────

const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function local(ms: number): { fecha: string; hora: number; min: number } {
  const p: Record<string, string> = {}
  for (const x of FMT.formatToParts(new Date(ms))) p[x.type] = x.value
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), min: Number(p.minute) }
}
const esNoche = (hora: number) => hora >= 22 || hora < 6
/** Minutos → horas con 2 decimales, sin multiplicar por 100 en euros: min × 5/3 = centésimas de hora. */
const horasDe = (minutos: number) => Math.round((minutos * 5) / 3) / 100
const dd = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`

interface Tramo { id: string; ini: number; fin: number }

// ── Función principal ───────────────────────────────────────────────────────

export function incidenciasDesdeFichajes(
  fichajes: readonly FichajeNomina[],
  contrato: ContratoHorario,
  convenio: ConvenioHorario,
  opts: OpcionesFichajes,
): ResultadoFichajes {
  const m = /^(\d{4})-(\d{2})$/.exec(opts.periodo)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`Período inválido: ${opts.periodo}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.hoy)) throw new Error(`hoy inválido: ${opts.hoy}`)
  if (opts.periodo >= opts.hoy.slice(0, 7)) throw new MesNoCerradoError(opts.periodo)

  for (const f of fichajes) {
    if (f.empresaId !== contrato.empresaId) throw new FichajeAjenoError(`fichaje ${f.id} de otra empresa`)
    if (f.empleadoId !== contrato.empleadoId) throw new FichajeAjenoError(`fichaje ${f.id} de otro empleado`)
  }

  const avisos: string[] = []
  const festivos = new Set(convenio.festivos)
  const tope = Math.min(TOPE_EXTRA_ANUAL_ET, convenio.topeExtraAnual ?? TOPE_EXTRA_ANUAL_ET)

  // 1) Fichajes computables: aprobados, cerrados y de ESTE mes (por fecha local de entrada).
  let sinAprobar = 0
  let abiertos = 0
  const porDia = new Map<string, Tramo[]>()
  const diasConSinAprobar = new Set<string>()
  for (const f of fichajes) {
    const ini = Date.parse(f.entradaAt)
    if (!Number.isFinite(ini)) { avisos.push(`Fichaje ${f.id} con fecha de entrada ilegible: no se computa`); continue }
    const fecha = local(ini).fecha
    if (fecha.slice(0, 7) !== opts.periodo) continue
    if (f.salidaAt === null) { abiertos++; continue }
    const fin = Date.parse(f.salidaAt)
    if (!Number.isFinite(fin) || fin <= ini) { avisos.push(`Fichaje ${f.id} con salida ilegible o anterior a la entrada: no se computa`); continue }
    if (!f.aprobado) { sinAprobar++; diasConSinAprobar.add(fecha); continue }
    const l = porDia.get(fecha) ?? []
    l.push({ id: f.id, ini, fin })
    porDia.set(fecha, l)
  }
  if (sinAprobar) avisos.push(`${sinAprobar} fichaje(s) sin aprobar: no se computan hasta que el responsable los apruebe`)
  if (abiertos) avisos.push(`${abiertos} fichaje(s) abierto(s) sin salida: no se computan`)

  const propuestas: PropuestaIncidencia[] = []
  const dias = [...porDia.keys()].sort()
  const parcial = contrato.tipoContrato === 'parcial'
  const ordinarias = convenio.horasDiariasOrdinarias === null ? null : Math.round((convenio.horasDiariasOrdinarias * 60 * contrato.jornadaPct) / 100) // minutos (jornadaPct: 100 = completa)
  const compensa = convenio.compensacionExtras === 'descanso'

  if (ordinarias === null) avisos.push('El convenio no indica la jornada diaria: no se proponen horas extra (dato pendiente, no se asume)')
  else if (convenio.compensacionExtras === null) avisos.push('El convenio no indica si las horas extra se compensan con descanso: se proponen para pago, el responsable decide')

  // 2) Extras por día: lo que excede la jornada ordinaria; se imputa a los ÚLTIMOS minutos trabajados.
  if (ordinarias !== null) {
    for (const fecha of dias) {
      const tramos = (porDia.get(fecha) ?? []).slice().sort((a, b) => a.ini - b.ini)
      const total = tramos.reduce((s, t) => s + Math.round((t.fin - t.ini) / MS_MIN), 0)
      const exceso = total - ordinarias
      if (exceso <= 0) continue
      if (parcial) {
        avisos.push(`${dd(fecha)}: ${horasDe(exceso)} h por encima de la jornada pactada en contrato a tiempo parcial = horas complementarias (art. 12 ET), no extra: revisar a mano`)
        continue
      }
      const cuenta: Record<SubtipoExtra, { min: number; ids: Set<string> }> = {
        diurna: { min: 0, ids: new Set() }, nocturna: { min: 0, ids: new Set() }, festiva: { min: 0, ids: new Set() },
      }
      let falta = exceso
      for (let i = tramos.length - 1; i >= 0 && falta > 0; i--) {
        const t = tramos[i]
        const dur = Math.round((t.fin - t.ini) / MS_MIN)
        const tomar = Math.min(falta, dur)
        for (let k = dur - tomar; k < dur; k++) {
          const l = local(t.ini + k * MS_MIN)
          const sub: SubtipoExtra = festivos.has(l.fecha) ? 'festiva' : esNoche(l.hora) ? 'nocturna' : 'diurna'
          cuenta[sub].min++
          cuenta[sub].ids.add(t.id)
        }
        falta -= tomar
      }
      for (const sub of ['diurna', 'nocturna', 'festiva'] as const) {
        const c = cuenta[sub]
        if (c.min === 0) continue
        const horas = horasDe(c.min)
        const nombre = sub === 'diurna' ? 'diurnas' : sub === 'nocturna' ? 'nocturnas' : 'festivas'
        const concepto = `Horas extra ${nombre} ${dd(fecha)} (fichajes)`
        propuestas.push({
          clave: `fichajes:${fecha}:${sub}`,
          tipo: compensa ? 'horas_extra_compensada' : 'horas_extra',
          subtipo: sub, fecha, horas, minutos: c.min,
          fichajeIds: [...c.ids].sort(),
          concepto: compensa ? `Horas extra ${nombre} ${dd(fecha)} compensadas con descanso` : concepto,
          incidencia: compensa ? null : { tipo: 'horas_extra', concepto, horas },
          superaTope: false,
        })
      }
    }
  }

  // 3) Tope anual: solo cuentan las que se PAGAN (art. 35.2 ET: las compensadas en 4 meses no computan).
  const pagoMes = propuestas.filter(p => p.tipo === 'horas_extra').reduce((s, p) => s + (p.minutos ?? 0), 0)
  const compMes = propuestas.filter(p => p.tipo === 'horas_extra_compensada').reduce((s, p) => s + (p.minutos ?? 0), 0)
  let acumMin = opts.horasExtraAnioPrevias === null ? null : Math.round(opts.horasExtraAnioPrevias * 60)
  let supera: boolean | null = null
  if (acumMin === null) {
    if (pagoMes > 0) avisos.push('No se pudo comprobar el acumulado anual de horas extra: el tope de 80 h NO está verificado')
  } else {
    for (const p of propuestas) {
      if (p.tipo !== 'horas_extra') continue
      acumMin += p.minutos ?? 0
      if (acumMin > tope * 60) p.superaTope = true
    }
    supera = acumMin > tope * 60
    if (supera) avisos.push(`Se supera el tope anual de ${tope} h extra (art. 35.2 ET): acumulado ${horasDe(acumMin)} h. No debería aprobarse lo que exceda`)
  }
  const horasExtraAnio = acumMin === null ? null : horasDe(acumMin)

  // 4) Ausencias: día previsto sin ningún fichaje (ni aprobado, ni pendiente) y sin justificar.
  if (opts.diasPrevistos === null) {
    avisos.push('Sin calendario laboral previsto: no se proponen ausencias')
  } else {
    const justificados = new Set(opts.diasJustificados ?? [])
    for (const fecha of [...new Set(opts.diasPrevistos)].sort()) {
      if (fecha.slice(0, 7) !== opts.periodo || porDia.has(fecha) || justificados.has(fecha)) continue
      if (diasConSinAprobar.has(fecha)) { avisos.push(`${dd(fecha)}: hay fichaje sin aprobar; no se propone ausencia hasta resolverlo`); continue }
      propuestas.push({
        clave: `fichajes:${fecha}:ausencia`, tipo: 'ausencia', fecha, dias: 1, fichajeIds: [],
        concepto: `Ausencia sin fichaje ${dd(fecha)}`,
        incidencia: { tipo: 'ausencia_injustificada', concepto: `Ausencia sin fichaje ${dd(fecha)}`, dias: 1 },
        superaTope: false,
      })
    }
  }

  // 5) Retrasos: informativos (descontar un retraso depende del convenio; nada entra en la nómina sin decisión humana).
  if (convenio.horaEntradaPrevista !== null) {
    const [hh, mm] = convenio.horaEntradaPrevista.split(':').map(Number)
    for (const fecha of dias) {
      const primero = (porDia.get(fecha) ?? []).slice().sort((a, b) => a.ini - b.ini)[0]
      const l = local(primero.ini)
      if (l.fecha !== fecha) continue
      const retraso = l.hora * 60 + l.min - (hh * 60 + mm)
      if (retraso > convenio.toleranciaRetrasoMin) {
        propuestas.push({
          clave: `fichajes:${fecha}:retraso`, tipo: 'retraso', fecha, minutos: retraso, fichajeIds: [primero.id],
          concepto: `Retraso de ${retraso} min el ${dd(fecha)}`, incidencia: null, superaTope: false,
        })
      }
    }
  }

  propuestas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave))
  return {
    periodo: opts.periodo, propuestas, avisos,
    horasExtraPagoMes: horasDe(pagoMes), horasExtraCompensadasMes: horasDe(compMes),
    horasExtraAnio, topeAnual: tope, superaTope: supera,
    fichajesSinAprobar: sinAprobar, fichajesAbiertos: abiertos,
  }
}
