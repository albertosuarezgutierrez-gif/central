// PATRIMONIO (22/10/2026, paso 7) — normaliza lo que la IA LEE de una factura. PURO (sin IA, sin prisma, sin sesión).
//
// Lo que sale de aquí es una PROPUESTA de una máquina, nunca un gasto: nadie la guarda como `confirmado` sin que la
// persona la revise. Regla del monorepo «dato que NO hay ≠ dato que NO se ha mirado»: `null` = no se sabe; jamás `0`,
// `''` ni un valor de cajón (`OTRO`, `N/A`, `desconocido`…). Un importe ≤ 0 o no numérico es `null`, no un gasto de 0 €.
import { esCategoriaGasto, esFecha, type CategoriaGasto } from '@central/module-patrimonio'

export type PropuestaFactura = {
  proveedor: string | null
  nifProveedor: string | null
  /** `YYYY-MM-DD` real; `null` si no consta o no es una fecha. */
  fecha: string | null
  baseCent: number | null
  ivaCent: number | null
  /** Retención de IRPF (importe, no porcentaje) que resta del total: alquileres, profesionales. `null` = no consta. */
  retencionCent: number | null
  totalCent: number | null
  concepto: string | null
  /** Nunca `OTRO`: «otro» es el cajón de «no lo sé» y se anula a `null`. */
  categoria: CategoriaGasto | null
}

export type FuenteFactura = 'texto' | 'vision' | 'none'

export const PROPUESTA_VACIA: PropuestaFactura = {
  proveedor: null, nifProveedor: null, fecha: null, baseCent: null, ivaCent: null, retencionCent: null, totalCent: null, concepto: null, categoria: null,
}

const CAJON = new Set(['', 'otro', 'otros', 'n/a', 'na', 'n.a.', 'null', 'undefined', 'none', 'desconocido', 'desconocida', 'no consta', 'no disponible', 'sin datos', '-', '--', '—', '?', 'ninguno', 'ninguna', 'unknown'])
const esCajon = (s: string) => CAJON.has(s.trim().toLowerCase())

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  if (esCajon(t)) return null
  return t.slice(0, max)
}

/** NIF/CIF español con la forma de uno (9 caracteres); si no la tiene, `null`: no se inventa ni se «arregla». */
function nif(v: unknown): string | null {
  const t = texto(v, 20)
  if (!t) return null
  const limpio = t.toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '')
  return /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJ-NP-SUVW][0-9]{7}[0-9A-J])$/.test(limpio) ? limpio : null
}

function fecha(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : t.slice(0, 10)
  return esFecha(iso) ? iso : null
}

/** Euros (número o «1.234,56») → céntimos enteros > 0; todo lo demás (0, negativo, texto, NaN) → `null`. */
export function eurosLeidosACentimos(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const s = v.replace(/[€\s]/g, '')
    // Con coma: los puntos son miles. Sin coma: «1.234» / «1.234.567» (grupos de 3) son miles españoles; «12.5» / «12.50», decimales.
    const canon = s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s
    if (!/^\d+(\.\d+)?$/.test(canon)) return null
    n = Number(canon)
  } else return null
  if (!Number.isFinite(n)) return null
  const cent = Math.round(n * 100)
  return Number.isSafeInteger(cent) && cent > 0 ? cent : null
}

export const TOLERANCIA_CENT = 2

/** Lo que debe sumar el total: base + IVA (si se conoce; exenta = 0) − retención (si la hay). */
export function cuadre(baseCent: number, ivaCent: number | null, retencionCent: number | null): number {
  return baseCent + (ivaCent ?? 0) - (retencionCent ?? 0)
}

export type FacturaNormalizada = { propuesta: PropuestaFactura; motivos: string[] }

/**
 * `bruto` = el JSON que devolvió la IA (cualquier cosa: `null`, texto, objeto a medias). No lanza nunca. Los `motivos`
 * son frases para la persona: qué no se ha podido leer y qué no cuadra (la revisión humana es el control).
 */
export function normalizarFacturaLeida(bruto: unknown): FacturaNormalizada {
  const b = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>
  const categoriaBruta = typeof b.categoria === 'string' ? b.categoria.trim().toUpperCase() : null
  const categoria = categoriaBruta && esCategoriaGasto(categoriaBruta) && categoriaBruta !== 'OTRO' ? categoriaBruta : null
  const p: PropuestaFactura = {
    proveedor: texto(b.proveedor, 120),
    nifProveedor: nif(b.nif_proveedor ?? b.nifProveedor),
    fecha: fecha(b.fecha),
    baseCent: eurosLeidosACentimos(b.base_imponible ?? b.base),
    ivaCent: eurosLeidosACentimos(b.iva),
    retencionCent: eurosLeidosACentimos(b.retencion ?? b.retencion_irpf),
    totalCent: eurosLeidosACentimos(b.total),
    concepto: texto(b.concepto, 200),
    categoria,
  }
  const motivos: string[] = []
  if (!p.proveedor) motivos.push('No hemos podido leer el proveedor.')
  if (p.nifProveedor === null && texto(b.nif_proveedor ?? b.nifProveedor, 20)) motivos.push('El NIF del proveedor leído no tiene un formato válido: se ha descartado.')
  if (!p.fecha) motivos.push('No hemos podido leer la fecha de la factura.')
  if (p.totalCent === null) motivos.push('No hemos podido leer el total.')
  if (p.baseCent === null) motivos.push('No hemos podido leer la base imponible.')
  if (!p.categoria) motivos.push('No hemos podido decidir la categoría: elígela tú.')
  // Cuadre: total = base + IVA − retención (tolerancia 2 céntimos por redondeos). Si no cuadra, se avisa; no se corrige a ojo.
  if (p.baseCent !== null && p.ivaCent !== null && p.totalCent !== null && Math.abs(cuadre(p.baseCent, p.ivaCent, p.retencionCent) - p.totalCent) > TOLERANCIA_CENT) {
    motivos.push('La base más el IVA, menos la retención si la hay, no suman el total leído: revisa los importes (puede haber un recargo).')
  }
  if (p.baseCent !== null && p.retencionCent !== null && p.retencionCent > p.baseCent) motivos.push('La retención leída es mayor que la base: revisa los importes.')
  return { propuesta: p, motivos }
}

export type PropuestaGuardada = { fuente: FuenteFactura; motivos: string[]; propuesta: PropuestaFactura }

const cent = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null)

/**
 * Lee el jsonb `propuesta` que dejó la subida (`{ fuente, motivos, leido }`) para reabrir la revisión. Defensiva: una
 * fila antigua (sin `retencionCent`) o corrupta no rompe la pantalla; lo ilegible vuelve a «no se sabe» (`null`), jamás a 0.
 */
export function leerPropuestaGuardada(json: unknown): PropuestaGuardada {
  const o = (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Record<string, unknown>
  const l = (o.leido && typeof o.leido === 'object' && !Array.isArray(o.leido) ? o.leido : {}) as Record<string, unknown>
  const fuente: FuenteFactura = o.fuente === 'texto' || o.fuente === 'vision' ? o.fuente : 'none'
  const motivos = Array.isArray(o.motivos) ? o.motivos.filter((m): m is string => typeof m === 'string') : []
  const categoria = typeof l.categoria === 'string' && l.categoria !== 'OTRO' && esCategoriaGasto(l.categoria) ? l.categoria : null
  const propuesta: PropuestaFactura = {
    proveedor: typeof l.proveedor === 'string' && l.proveedor ? l.proveedor : null,
    nifProveedor: typeof l.nifProveedor === 'string' && l.nifProveedor ? l.nifProveedor : null,
    fecha: typeof l.fecha === 'string' && esFecha(l.fecha) ? l.fecha : null,
    baseCent: cent(l.baseCent),
    ivaCent: cent(l.ivaCent),
    retencionCent: cent(l.retencionCent),
    totalCent: cent(l.totalCent),
    concepto: typeof l.concepto === 'string' && l.concepto ? l.concepto : null,
    categoria,
  }
  return { fuente, motivos, propuesta }
}
