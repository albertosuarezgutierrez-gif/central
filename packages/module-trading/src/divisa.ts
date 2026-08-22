// Tipo de cambio por FECHA para poder decir en euros lo que el bróker apunta en dólares.
//
// Por qué existe: el libro tiene `tipo_cambio` a NULL en 568 de 569 filas, y sin él **no hay cifra en
// euros defendible** — ni para la asesoría ni para cuadrar el NAV. No vale usar el cambio de HOY para
// una operación de hace un año: eso es la mentira del PR #1189 (leer un dato con la unidad equivocada)
// con otro disfraz. Cada operación se convierte al cambio de SU día.
//
// La fuente es la serie diaria de un proveedor (Alpha Vantage `FX_DAILY`, CSV `timestamp,open,high,low,
// close`). Este módulo no llama a nadie: recibe el CSV y resuelve fechas.

export type PuntoFx = { fecha: string; cierre: number }

/** Parsea el CSV de la serie diaria. Ignora filas mal formadas en vez de inventar un 0. */
export function parseFxDailyCsv(csv: string): PuntoFx[] {
  const puntos: PuntoFx[] = []
  for (const linea of csv.trim().split(/\r?\n/)) {
    const campos = linea.split(',')
    if (campos.length < 5) continue
    const [fecha, , , , cierre] = campos
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue        // cabecera y basura fuera
    const n = Number(cierre)
    if (!Number.isFinite(n) || n <= 0) continue             // un cambio de 0 no existe: se descarta
    puntos.push({ fecha, cierre: n })
  }
  return puntos
}

/** Índice fecha→cierre para resolver en O(1). */
export function indexarFx(puntos: PuntoFx[]): Map<string, number> {
  return new Map(puntos.map(p => [p.fecha, p.cierre]))
}

/** Días naturales que se admite retroceder buscando la última sesión con cotización. */
export const MAX_DIAS_ATRAS = 7

export type ResolucionFx = {
  /** Cambio aplicable, o `null` si no se ha podido resolver. NUNCA un valor por defecto. */
  tipoCambio: number | null
  /** Fecha de la sesión de la que sale el cambio (≠ fecha de la operación en fines de semana). */
  fechaUsada: string | null
  /** Días naturales que hubo que retroceder. 0 = la propia fecha cotizaba. */
  diasAtras: number | null
}

function restarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(a, m - 1, d) - n * 86_400_000
  const f = new Date(t)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${f.getUTCFullYear()}-${p(f.getUTCMonth() + 1)}-${p(f.getUTCDate())}`
}

/**
 * Resuelve el cambio de una fecha. Si ese día no cotizó (fin de semana, festivo), retrocede hasta
 * `MAX_DIAS_ATRAS` buscando la última sesión ANTERIOR.
 *
 * 🚨 Nunca mira hacia DELANTE: usar el cambio del lunes para una operación del sábado sería meter
 * información que en ese momento no existía. Y si no lo encuentra devuelve `null`, no el último que
 * haya a mano: un `tipo_cambio` inventado convierte todo el euro del informe en un número falso.
 */
export function resolverTipoCambio(fecha: string, indice: Map<string, number>): ResolucionFx {
  for (let i = 0; i <= MAX_DIAS_ATRAS; i++) {
    const f = restarDias(fecha, i)
    const c = indice.get(f)
    if (c !== undefined) return { tipoCambio: c, fechaUsada: f, diasAtras: i }
  }
  return { tipoCambio: null, fechaUsada: null, diasAtras: null }
}

/**
 * Convierte un importe en USD a EUR. La serie es EUR→USD (cuántos dólares vale un euro), así que se
 * DIVIDE. Devuelve `null` si no hay cambio: quien llame debe decir «pendiente», no pintar un 0.
 */
export function usdAEur(importeUsd: number, tipoCambioEurUsd: number | null): number | null {
  if (tipoCambioEurUsd === null || !Number.isFinite(tipoCambioEurUsd) || tipoCambioEurUsd <= 0) return null
  return importeUsd / tipoCambioEurUsd
}

/** ¿Cae el cambio ejecutado por el bróker dentro del rango del día? Contraste de cordura. */
export function dentroDelRango(ejecutado: number, low: number, high: number): boolean {
  return ejecutado >= low && ejecutado <= high
}
