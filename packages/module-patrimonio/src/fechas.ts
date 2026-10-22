// Fechas de calendario como texto ISO `YYYY-MM-DD`, sin hora ni zona.
//
// Un vencimiento, el inicio de un contrato o el día del cargo de la comunidad son días del CALENDARIO,
// no instantes: guardarlos como `Date` y operar con `getMonth()`/`setDate()` del huso local mueve el
// día según dónde corra el servidor (Vercel en UTC, el portátil en Madrid). Aquí todo es UTC puro.
// 🚨 Ninguna función lee el reloj: `hoy` entra SIEMPRE como parámetro (regla de la casa: test con
// fecha fija contra reloj real = bomba de tiempo).

export type Fecha = string

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** `true` si es una fecha de calendario real (rechaza `2026-02-30`, `2026-13-01`, texto). */
export function esFecha(v: unknown): v is Fecha {
  if (typeof v !== 'string') return false
  const m = RE_FECHA.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= diasDelMes(y, mo)
}

export function partes(f: Fecha): { y: number; m: number; d: number } {
  if (!esFecha(f)) throw new Error(`fecha_invalida: ${String(f)}`)
  return { y: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)), d: Number(f.slice(8, 10)) }
}

export function fecha(y: number, m: number, d: number): Fecha {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Días del mes `m` (1–12) del año `y`. */
export function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function aDiaUtc(f: Fecha): number {
  const { y, m, d } = partes(f)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function deDiaUtc(n: number): Fecha {
  const dt = new Date(n * 86_400_000)
  return fecha(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  return deDiaUtc(aDiaUtc(f) + dias)
}

/** `b − a` en días (positivo si `b` es posterior). */
export function diasEntre(a: Fecha, b: Fecha): number {
  return aDiaUtc(b) - aDiaUtc(a)
}

/**
 * Suma meses RECORTANDO al último día del mes destino: 31/01 + 1 mes = 28/02 (o 29), nunca 03/03.
 * (El `setMonth` nativo desborda al mes siguiente: es justo el error que aquí se evita.)
 */
export function sumarMeses(f: Fecha, meses: number): Fecha {
  const { y, m, d } = partes(f)
  const total = y * 12 + (m - 1) + meses
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return fecha(ny, nm, Math.min(d, diasDelMes(ny, nm)))
}

export function sumarAnios(f: Fecha, anios: number): Fecha {
  return sumarMeses(f, anios * 12)
}

/** Clave de mes `YYYY-MM`. */
export function mesDe(f: Fecha): string {
  return f.slice(0, 7)
}

export function minFecha(a: Fecha, b: Fecha): Fecha {
  return a <= b ? a : b
}

export function maxFecha(a: Fecha, b: Fecha): Fecha {
  return a >= b ? a : b
}

/** Primer día del mes de `f`. */
export function inicioDeMes(f: Fecha): Fecha {
  return `${f.slice(0, 7)}-01`
}

/** `Date` a mediodía UTC del día dado: segura frente a husos de ±11 h para los helpers de `Date` local. */
export function aDateMediodia(f: Fecha): Date {
  const { y, m, d } = partes(f)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** Inversa de `aDateMediodia`. Lee la fecha en UTC. */
export function deDateMediodia(dt: Date): Fecha {
  return fecha(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}
