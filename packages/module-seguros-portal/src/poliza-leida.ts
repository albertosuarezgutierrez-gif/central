/**
 * Normalización de lo que una IA dice haber leído en una póliza.
 *
 * Puro: sin BD, sin red. Vive aquí y no en la app porque es LA regla que decide
 * si un dato existe o no, y esa decisión no puede depender de qué proveedor de
 * IA respondió.
 *
 * La regla de la casa, entera:
 *  - `null` = «no se sabe». Es el estado por defecto de todo campo.
 *  - Un valor de CAJÓN (`''`, `'desconocido'`, `'N/A'`, `'no consta'`…) es un
 *    «no lo he sabido leer» disfrazado de dato: se ANULA aquí, antes de que
 *    nadie lo escriba, porque si no se cuela por todas las guardas basadas en
 *    NULL (`??`, `COALESCE`, `IS NULL`).
 *  - Nada se inventa ni se deduce: lo que no encaje con su forma se anula.
 */

/** Ramos que el extractor puede devolver. Cualquier otra cosa es «no se sabe». */
export const RAMOS_POLIZA = [
  'auto',
  'moto',
  'hogar',
  'vida',
  'salud',
  'decesos',
  'responsabilidad_civil',
  'comercio',
  'comunidades',
  'otros',
] as const
export type RamoPoliza = (typeof RAMOS_POLIZA)[number]

export type PolizaLeida = {
  compania: string | null
  numeroPoliza: string | null
  ramo: RamoPoliza | null
  primaAnual: number | null
  fechaVencimiento: string | null
}

/** Los cinco campos a «no se sabe». Es el resultado de no haber podido leer nada. */
export function polizaLeidaVacia(): PolizaLeida {
  return {
    compania: null,
    numeroPoliza: null,
    ramo: null,
    primaAnual: null,
    fechaVencimiento: null,
  }
}

/**
 * Marcadores que los modelos escriben cuando NO han encontrado el dato. Ninguno
 * es un dato: todos significan «no se sabe» y por eso salen de aquí como `null`.
 * ⚠️ `'otros'` NO está en la lista a propósito: en un ramo es una respuesta del
 * documento («no es ninguno de los anteriores»), no un fallo de lectura.
 */
const MARCADORES_SIN_DATO = new Set([
  '',
  '-',
  '--',
  '—',
  'n/a',
  'na',
  'null',
  'undefined',
  'nan',
  'none',
  'ninguno',
  'ninguna',
  'desconocido',
  'desconocida',
  'sin datos',
  'sin dato',
  'no consta',
  'no disponible',
  'no especificado',
  'no especificada',
  'no encontrado',
  'no encontrada',
  'no indicado',
  'no indicada',
  'pendiente',
  '?',
])

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.trim()
  if (MARCADORES_SIN_DATO.has(limpio.toLowerCase())) return null
  return limpio
}

function numero(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = texto(v)
    if (t === null) return null
    // El modelo puede colar el símbolo o un separador de miles pese al prompt.
    n = Number(t.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  } else return null
  // Una prima de 0€ no existe: es un «no lo he leído» con forma de número.
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function fechaIso(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const d = new Date(`${t}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  // Rechaza los días que el Date «arregla» solo (2026-02-31 → 3 de marzo).
  if (d.toISOString().slice(0, 10) !== t) return null
  return t
}

function ramo(v: unknown): RamoPoliza | null {
  const t = texto(v)
  if (t === null) return null
  const bajo = t.toLowerCase()
  return (RAMOS_POLIZA as readonly string[]).includes(bajo) ? (bajo as RamoPoliza) : null
}

/**
 * Convierte lo que sea que haya devuelto el modelo en los cinco campos, cada uno
 * con dato o con `null`. Nunca lanza: si la entrada no es un objeto, todo es `null`.
 */
export function normalizarPolizaLeida(bruto: unknown): PolizaLeida {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return polizaLeidaVacia()
  const o = bruto as Record<string, unknown>
  return {
    compania: texto(o.compania),
    numeroPoliza: texto(o.numeroPoliza),
    ramo: ramo(o.ramo),
    primaAnual: numero(o.primaAnual),
    fechaVencimiento: fechaIso(o.fechaVencimiento),
  }
}

/** ¿Se ha leído ALGO? `false` no dice «la póliza no tiene datos», dice «no los hemos leído». */
export function seLeyoAlgo(p: PolizaLeida): boolean {
  return Object.values(p).some((v) => v !== null)
}
