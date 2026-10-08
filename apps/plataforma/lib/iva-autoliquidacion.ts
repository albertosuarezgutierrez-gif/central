// apps/plataforma/lib/iva-autoliquidacion.ts
// IVA de proveedores EXTRANJEROS (inversión del sujeto pasivo, art. 84.Uno.2º LIVA). Módulo PURO
// (sin BD ni red), testeable con `node --test`. Informativo para la asesoría: NO altera los totales
// de IVA soportado del informe trimestral.
//   · intracomunitario (VAT UE ≠ ES; p.ej. IE de Anthropic Ireland, NL de Booking.com B.V.):
//     303 «adquisiciones intracomunitarias de servicios» (devengado + deducible) y modelo 349 (clave I).
//   · extracomunitario (USA: Vercel Inc., OpenRouter Inc., PriceLabs Inc.): 303 «inversión del sujeto
//     pasivo (resto)» (devengado + deducible); sin 349.
// Regla del repo: null = «no se sabe», nunca ?? 0 al afirmar. Sin cuota_iva (null) NO se afirma nada.

export type ClaseProveedor = 'nacional' | 'intracomunitario' | 'extracomunitario'

export const TIPO_IVA_AUTOLIQUIDACION = 0.21

const PAISES_UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'GR', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

export type ProveedorIva = {
  proveedor: string | null
  nif?: string | null // NIF o VAT number (con o sin prefijo de país)
  pais?: string | null // ISO-2
}

const norm = (s: string | null | undefined) => (s ?? '').trim()

// Prefijo de país de un VAT («IE6388047V», «NL 8123.45.678.B01»). null si no parece uno.
function paisDeVat(nif: string): string | null {
  const m = /^([A-Z]{2})[\s.-]?[A-Z0-9]/.exec(nif.toUpperCase())
  if (!m) return null
  const p = m[1]
  if (p === 'ES') return 'ES'
  if (PAISES_UE.has(p)) return p === 'EL' ? 'GR' : p
  return null
}

// Un NIF español: 8 dígitos+letra, X/Y/Z+7 dígitos+letra, o letra de sociedad+7 dígitos+control.
const NIF_ES = /^(?:ES[\s-]?)?(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/

// Nombre → país/clase cuando no hay NIF ni país. Solo señales inequívocas; si no, null.
const NOMBRES_UE = /\b(ireland|b\.?\s?v\.?|gmbh|ag|s\.?\s?a\.?\s?r\.?\s?l|sarl|ltd\.? ireland|limited ireland|n\.?v\.?|oy|ab|aps|s\.?p\.?a\.?|s\.?r\.?l\.?\s+italia)\b/i
const NOMBRES_NACIONAL = /\b(s\.?\s?l\.?u?|s\.?\s?a\.?u?|s\.?\s?l\.?\s?p|s\.?\s?coop|c\.?b\.?|s\.?c\.?)\.?\s*$|\b(sociedad limitada|sociedad anónima|sociedad anonima|s\.l\.|s\.a\.)/i
const NOMBRES_EXTRA = /\b(inc\.?|llc|l\.l\.c\.?|pbc|corp\.?|corporation|ltd\.?|limited)\s*$/i

export function clasificarProveedorIva(p: ProveedorIva): ClaseProveedor | null {
  const pais = norm(p.pais).toUpperCase()
  if (pais) {
    if (pais === 'ES') return 'nacional'
    if (PAISES_UE.has(pais)) return 'intracomunitario'
    if (/^[A-Z]{2}$/.test(pais)) return 'extracomunitario'
  }
  const nif = norm(p.nif).toUpperCase()
  if (nif) {
    if (NIF_ES.test(nif.replace(/[\s.-]/g, '') ) || NIF_ES.test(nif)) return 'nacional'
    const pv = paisDeVat(nif)
    if (pv === 'ES') return 'nacional'
    if (pv) return 'intracomunitario'
    // EIN/otros identificadores sin prefijo UE: no decide por sí solos.
  }
  const nombre = norm(p.proveedor)
  if (!nombre) return null
  // UE ANTES que extra: «Anthropic Ireland, Limited» termina en Limited pero es irlandesa.
  if (NOMBRES_UE.test(nombre) && !NOMBRES_NACIONAL.test(nombre)) return 'intracomunitario'
  if (NOMBRES_NACIONAL.test(nombre)) return 'nacional'
  if (NOMBRES_EXTRA.test(nombre)) return 'extracomunitario'
  return null
}

export type FacturaIva = ProveedorIva & {
  id?: string
  importe: number | null // base cuando no hay cuota repercutida
  cuota_iva: number | null
  fecha: string | null // yyyy-mm-dd (devengo)
  estado?: string | null
}

// ¿Requiere autoliquidación? true = sí; false = no (nacional o ya trae cuota); null = no se sabe.
export function requiereAutoliquidacion(f: FacturaIva): boolean | null {
  const clase = clasificarProveedorIva(f)
  if (clase === null) return null
  if (clase === 'nacional') return false
  if (f.cuota_iva === null || f.cuota_iva === undefined) return null // cuota sin extraer ≠ cuota 0
  return Number(f.cuota_iva) === 0
}

export type LineaAutoliq = {
  id: string | null
  proveedor: string
  fecha: string
  clase: 'intracomunitario' | 'extracomunitario'
  base: number
  cuota: number
  estado: string | null
}

export type TrimAutoliq = {
  q: number
  base: number
  cuota: number // devengada = deducible (efecto neto 0 si el derecho a deducir es total)
  baseUE: number // → 303 adquisiciones intracomunitarias + 349
  cuotaUE: number
  baseExtra: number // → 303 inversión del sujeto pasivo (resto)
  cuotaExtra: number
  facturas: LineaAutoliq[]
}

export type AutoliquidacionAnual = {
  trimestres: TrimAutoliq[]
  // Facturas de proveedor extranjero cuya clase o cuota no se pudo determinar: «no se sabe».
  sinClasificar: number
  sinFecha: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function calcularAutoliquidacion(facturas: FacturaIva[], year: number): AutoliquidacionAnual {
  const trims: TrimAutoliq[] = [1, 2, 3, 4].map((q) => ({
    q, base: 0, cuota: 0, baseUE: 0, cuotaUE: 0, baseExtra: 0, cuotaExtra: 0, facturas: [],
  }))
  let sinClasificar = 0
  let sinFecha = 0
  for (const f of facturas) {
    if (f.estado === 'rechazada') continue
    const req = requiereAutoliquidacion(f)
    if (req === null) { sinClasificar++; continue }
    if (!req) continue
    const base = f.importe
    if (base === null || base === undefined || !(Number(base) > 0)) { sinClasificar++; continue }
    const m = f.fecha ? /^(\d{4})-(\d{2})-/.exec(f.fecha) : null
    if (!m) { sinFecha++; continue }
    if (Number(m[1]) !== year) continue
    const q = Math.ceil(Number(m[2]) / 3)
    const clase = clasificarProveedorIva(f) as 'intracomunitario' | 'extracomunitario'
    const b = Number(base)
    const cuota = b * TIPO_IVA_AUTOLIQUIDACION
    const t = trims[q - 1]
    t.facturas.push({ id: f.id ?? null, proveedor: norm(f.proveedor), fecha: f.fecha as string, clase, base: r2(b), cuota: r2(cuota), estado: f.estado ?? null })
    if (clase === 'intracomunitario') { t.baseUE += b; t.cuotaUE += cuota } else { t.baseExtra += b; t.cuotaExtra += cuota }
  }
  for (const t of trims) {
    t.baseUE = r2(t.baseUE); t.cuotaUE = r2(t.cuotaUE)
    t.baseExtra = r2(t.baseExtra); t.cuotaExtra = r2(t.cuotaExtra)
    t.base = r2(t.baseUE + t.baseExtra); t.cuota = r2(t.cuotaUE + t.cuotaExtra)
  }
  return { trimestres: trims, sinClasificar, sinFecha }
}
