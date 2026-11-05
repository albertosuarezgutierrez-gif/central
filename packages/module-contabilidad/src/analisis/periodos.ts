// Periodos con RELOJ INYECTADO (nunca la fecha del sistema dentro de la lógica). PURO.
// Fechas ISO `AAAA-MM-DD` en UTC. Un periodo es mes, trimestre natural o año natural.
export type TipoPeriodo = 'mes' | 'trimestre' | 'anio'
export type Rango = { desde: string; hasta: string }

export const esTipoPeriodo = (v: unknown): v is TipoPeriodo => v === 'mes' || v === 'trimestre' || v === 'anio'

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const finDeMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

export function rangoPeriodo(tipo: TipoPeriodo, hoy: Date): Rango {
  const a = hoy.getUTCFullYear()
  const m = hoy.getUTCMonth() + 1
  if (tipo === 'anio') return { desde: iso(a, 1, 1), hasta: iso(a, 12, 31) }
  if (tipo === 'trimestre') {
    const m0 = Math.floor((m - 1) / 3) * 3 + 1
    return { desde: iso(a, m0, 1), hasta: iso(a, m0 + 2, finDeMes(a, m0 + 2)) }
  }
  return { desde: iso(a, m, 1), hasta: iso(a, m, finDeMes(a, m)) }
}

/** Periodo inmediatamente anterior del mismo tipo. */
export function periodoAnterior(tipo: TipoPeriodo, r: Rango): Rango {
  const [a, m] = r.desde.split('-').map(Number)
  const pasos = tipo === 'mes' ? 1 : tipo === 'trimestre' ? 3 : 12
  return rangoPeriodo(tipo, new Date(Date.UTC(a, m - 1 - pasos, 1)))
}

/** Mismo periodo del año anterior. */
export function mismoPeriodoAnioAnterior(tipo: TipoPeriodo, r: Rango): Rango {
  const [a, m] = r.desde.split('-').map(Number)
  return rangoPeriodo(tipo, new Date(Date.UTC(a - 1, m - 1, 1)))
}

export type Comparativa = { actual: Rango; anterior: Rango; anioPasado: Rango }

/** Los tres rangos que compara el panel: el periodo en curso, el anterior y el mismo del año pasado. */
export function rangosComparativa(tipo: TipoPeriodo, hoy: Date): Comparativa {
  const actual = rangoPeriodo(tipo, hoy)
  return { actual, anterior: periodoAnterior(tipo, actual), anioPasado: mismoPeriodoAnioAnterior(tipo, actual) }
}

export type Granularidad = TipoPeriodo

export type Cubo = { clave: string; etiqueta: string; desde: string; hasta: string }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Etiqueta corta de un cubo: «mar 26», «T1 26» o «2026». */
export function etiquetaCubo(gran: Granularidad, desde: string): string {
  const [a, m] = desde.split('-').map(Number)
  if (gran === 'anio') return String(a)
  if (gran === 'trimestre') return `T${Math.floor((m - 1) / 3) + 1} ${String(a).slice(2)}`
  return `${MESES[m - 1]} ${String(a).slice(2)}`
}

/** Los `n` últimos cubos de la granularidad, el último es el que contiene `hoy` (de más antiguo a más reciente). */
export function cubosHasta(gran: Granularidad, hoy: Date, n: number): Cubo[] {
  if (!Number.isInteger(n) || n < 1 || n > 120) throw new RangeError('n entre 1 y 120')
  const paso = gran === 'mes' ? 1 : gran === 'trimestre' ? 3 : 12
  const actual = rangoPeriodo(gran, hoy)
  const [a, m] = actual.desde.split('-').map(Number)
  const salida: Cubo[] = []
  for (let i = n - 1; i >= 0; i--) {
    const r = rangoPeriodo(gran, new Date(Date.UTC(a, m - 1 - paso * i, 1)))
    salida.push({ clave: r.desde.slice(0, gran === 'anio' ? 4 : 7), etiqueta: etiquetaCubo(gran, r.desde), ...r })
  }
  return salida
}

/** Días naturales entre dos fechas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

export const aFechaISO = (d: Date): string => d.toISOString().slice(0, 10)
