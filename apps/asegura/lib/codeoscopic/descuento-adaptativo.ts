// Descuento adaptativo del ReRate (decisión de Alberto, 07/11/2026): se pide SIEMPRE el máximo (50) y, si la compañía
// rechaza el ReRate por el descuento, se baja hasta que lo acepte. PURO: entra el 400 del vendor y las opciones enviadas,
// salen las opciones con el descuento rebajado (o `null` si el 400 no es de descuento / ya no queda margen).
//
// Solo rebaja ids que PUSO el código (catálogo, vendor-con-id o los pedidos del corredor): el caller pasa `permitidos`.
// Jamás se llama con las opciones del formulario del corredor (`productOptionsCorredor`): eso lo garantiza la ruta.
import { lineasDelVendor } from './interprete-400.ts'

/** Escalones cuando el mensaje no trae máximo. */
export const ESCALONES_DESCUENTO: readonly number[] = [50, 30, 20, 10, 0]
/** Reintentos máximos por campo de descuento (50→30→20→10→0 son 4 bajadas). */
export const MAX_REINTENTOS_DESCUENTO = 4

// Alias en texto (el vendor a veces nombra el campo por su etiqueta, no por su id).
const ALIAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/venta cruzada|cross.?sell/i, 'dtoVentaCruzada'],
  [/\bcap\b/i, 'dtoCap'],
]
const RE_DESCUENTO = /descuento|discount|\bdto\b|bonificaci/i
const RE_MAXIMO = [
  /(?:m[aá]x(?:imo|imum|\.)?|up to|hasta|cannot exceed|can'?t exceed|exceed(?:s)?|at most|no (?:puede|debe)(?: ser)?(?: mayor| superior)?(?: que| a| de)?|<=|≤|menor o igual(?: que| a)?|less than or equal to)\D{0,40}?(\d{1,3}(?:[.,]\d+)?)/i,
  /(?:between|entre)\s+\d{1,3}(?:[.,]\d+)?\s+(?:and|y)\s+(\d{1,3}(?:[.,]\d+)?)/i,
]

export type Rebaja = {
  opciones: unknown[]
  /** Valor nuevo de cada id rebajado en ESTE paso. */
  rebajados: Record<string, number>
  /** Reintentos acumulados por id (pásalos tal cual a la siguiente llamada). */
  intentos: Record<string, number>
}

const esObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o)

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

/** Máximo numérico que nombra una línea del vendor, entero ≥ 0, o `null`. */
export function maximoDeLinea(linea: string): number | null {
  for (const re of RE_MAXIMO) {
    const m = re.exec(linea)
    if (m) {
      const n = Number(m[1].replace(',', '.'))
      if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.floor(n)
    }
  }
  return null
}

function siguienteEscalon(actual: number): number | null {
  return ESCALONES_DESCUENTO.find((e) => e < actual) ?? null
}

/**
 * `detalle`: el `e.detalle` del `ErrorCodeoscopic`. `opciones`: las ENVIADAS. `permitidos`: ids que puso el código.
 * `intentos`: reintentos ya gastados por id. `null` = no es un 400 de descuento (la cascada sigue intacta) o ya no se puede bajar.
 */
export function rebajarDescuento(
  detalle: string,
  opciones: unknown,
  permitidos: readonly string[],
  intentos: Readonly<Record<string, number>> = {},
): Rebaja | null {
  if (!Array.isArray(opciones) || permitidos.length === 0) return null
  const lista = opciones.map((o) => (esObj(o) ? { ...o } : o))
  const hallar = (id: string) => lista.find((o) => esObj(o) && o.id === id) as Record<string, unknown> | undefined

  // Objetivos: id → máximo que dice el mensaje (o null = escalón).
  const objetivos = new Map<string, number | null>()
  const mejor = (id: string, max: number | null) => {
    const previo = objetivos.get(id)
    objetivos.set(id, previo == null ? max : max == null ? previo : Math.min(previo, max))
  }
  for (const linea of lineasDelVendor(detalle)) {
    const l = linea.toLowerCase()
    const nombrados = permitidos.filter((id) => l.includes(id.toLowerCase()))
    const alias = ALIAS.filter(([re]) => re.test(linea)).map(([, id]) => id).filter((id) => permitidos.includes(id))
    const generico = RE_DESCUENTO.test(linea)
    if (nombrados.length === 0 && alias.length === 0 && !generico) continue
    const max = maximoDeLinea(linea)
    // «El campo Descuento… es obligatorio» = FALTA el campo, no sobra descuento: no se toca (lo gestiona `faltan_producto`).
    if (max === null && /obligatori|mandatory|required|requerid|missing|falta/i.test(linea)) continue
    // Línea que nombra un campo → ese; si solo habla de «descuento» a secas → todos los nuestros.
    const ids = nombrados.length > 0 ? nombrados : alias.length > 0 ? alias : [...permitidos]
    for (const id of ids) mejor(id, max)
  }

  const rebajados: Record<string, number> = {}
  const nuevos: Record<string, number> = { ...intentos }
  for (const [id, max] of objetivos) {
    const o = hallar(id)
    if (!o) continue
    const actual = numero(o.value)
    if (actual === null || actual <= 0) continue
    if ((nuevos[id] ?? 0) >= MAX_REINTENTOS_DESCUENTO) continue
    const destino = max !== null && max < actual ? max : siguienteEscalon(actual)
    if (destino === null || destino >= actual) continue
    o.value = typeof o.value === 'string' ? String(destino) : destino
    rebajados[id] = destino
    nuevos[id] = (nuevos[id] ?? 0) + 1
  }
  if (Object.keys(rebajados).length === 0) return null
  return { opciones: lista, rebajados, intentos: nuevos }
}

/** Valores finales de los ids de descuento (para dejar constancia en la respuesta y el historial). */
export function descuentosEnOpciones(opciones: unknown, ids: readonly string[]): Record<string, number> {
  const r: Record<string, number> = {}
  if (!Array.isArray(opciones)) return r
  for (const id of ids) {
    const o = opciones.find((x) => esObj(x) && x.id === id)
    const n = esObj(o) ? numero(o.value) : null
    if (n !== null) r[id] = n
  }
  return r
}
