// BORRADOR de factura recibida (lo que dice la factura del proveedor) y su mapeo desde la extracción (IA o XML). PURO.
//
// Unidades: dinero en CÉNTIMOS (enteros), cantidades en MILÉSIMAS (enteros: 1 ud = 1000; 1 litro = 1000), IVA en PUNTOS BÁSICOS
// (21 % = 2100). Lo que la extracción no trae es `null` («no se sabe»), NUNCA 0: un null no autoriza a dar nada por bueno (el case
// lo trata como diferencia que bloquea).
export interface LineaFacturaRecibida {
  clave: string | null // referencia / código de artículo del proveedor
  descripcion: string
  cantidadMil: number | null
  precioUnitCent: number | null // sin IVA, por unidad (o por litro)
  ivaPb: number | null
  importeCent: number | null // base de la línea, sin IVA
}
export interface BaseIva { ivaPb: number; baseCent: number; cuotaCent: number | null }
export interface BorradorFacturaRecibida {
  nifEmisor: string | null
  nombreEmisor: string | null
  nifReceptor: string | null
  numero: string | null
  fecha: string | null // AAAA-MM-DD
  divisa: string | null
  lineas: LineaFacturaRecibida[]
  bases: BaseIva[]
  retencionCent: number | null
  /** Importe a pagar: Σ bases + Σ cuotas − retención. */
  totalCent: number | null
}

// ─── Conversión de números ───────────────────────────────────────────────────
/** Número desde lo que devuelva la IA: 12.5 · "12,50" · "1.234,56" · "1,234.56" · "12.50 €". null si no es un número. */
export function numeroDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[€\s ]|EUR/gi, '')
  if (!s || !/^-?[\d.,]+$/.test(s)) return null
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.')
  if (coma > -1 && punto > -1) s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (coma > -1) s = /,\d{3}$/.test(s) && (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  else if ((s.match(/\./g)?.length ?? 0) > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
/** Escala un decimal a entero (×factor) sin errores de coma flotante del tipo 0.29*100 = 28.999… */
const escalar = (n: number | null, factor: number): number | null => {
  if (n == null) return null
  const r = Math.round(Number((n * factor).toFixed(6)))
  return Number.isSafeInteger(r) ? r : null
}
export const aCentimos = (v: unknown) => escalar(numeroDe(v), 100)
export const aMilesimas = (v: unknown) => escalar(numeroDe(v), 1000)
export const aPuntosBasicos = (v: unknown) => {
  const n = numeroDe(v)
  if (n == null || n < 0 || n > 100) return null
  return escalar(n, 100)
}

// ─── Textos ──────────────────────────────────────────────────────────────────
/** NIF/CIF/NIE normalizado para comparar: mayúsculas, sin espacios/puntos/guiones y sin el prefijo de país «ES». */
export function normalizarNif(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let s = v.toUpperCase().replace(/[\s.\-/]/g, '')
  if (/^ES[0-9A-Z]{9}$/.test(s)) s = s.slice(2)
  return /^[0-9A-Z]{5,15}$/.test(s) ? s : null
}
const texto = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max)
  return s ? s : null
}
/** Fecha AAAA-MM-DD desde AAAA-MM-DD, DD/MM/AAAA o DD-MM-AAAA; null si no es una fecha real. */
export function fechaDe(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let a: number, m: number, d: number
  let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─── Mapeo de la extracción ──────────────────────────────────────────────────
/**
 * Forma que se le pide a la IA (y que también produce el lector de XML). Importes en EUROS con decimales; porcentajes en %.
 * Se documenta en `PROMPT_EXTRACCION_FACTURA`.
 */
export interface ExtraccionCruda {
  nif_emisor?: unknown; nombre_emisor?: unknown; nif_receptor?: unknown; numero?: unknown; fecha?: unknown; divisa?: unknown
  lineas?: unknown; bases?: unknown; retencion?: unknown; total?: unknown
}

export const MAX_LINEAS_FACTURA = 300

export type ResultadoMapeo = { ok: true; borrador: BorradorFacturaRecibida; avisos: string[] } | { ok: false; motivo: string }

export function mapearExtraccion(raw: unknown): ResultadoMapeo {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, motivo: 'la extracción no es un objeto' }
  const r = raw as ExtraccionCruda
  const avisos: string[] = []
  const lineasIn = Array.isArray(r.lineas) ? r.lineas : []
  if (!Array.isArray(r.lineas)) avisos.push('la extracción no trae líneas')
  if (lineasIn.length > MAX_LINEAS_FACTURA) return { ok: false, motivo: `demasiadas líneas (${lineasIn.length})` }
  const lineas: LineaFacturaRecibida[] = []
  for (const x of lineasIn) {
    if (!x || typeof x !== 'object') continue
    const l = x as Record<string, unknown>
    const descripcion = texto(l.descripcion) ?? texto(l.referencia) ?? ''
    if (!descripcion) { avisos.push('una línea sin descripción se ha ignorado'); continue }
    lineas.push({
      clave: texto(l.referencia, 60), descripcion, cantidadMil: aMilesimas(l.cantidad), precioUnitCent: aCentimos(l.precio_unitario),
      ivaPb: aPuntosBasicos(l.iva_porcentaje), importeCent: aCentimos(l.importe),
    })
  }
  const bases: BaseIva[] = []
  for (const x of Array.isArray(r.bases) ? r.bases : []) {
    if (!x || typeof x !== 'object') continue
    const b = x as Record<string, unknown>
    const ivaPb = aPuntosBasicos(b.iva_porcentaje), baseCent = aCentimos(b.base)
    if (ivaPb == null || baseCent == null) { avisos.push('un tramo de IVA sin tipo o sin base se ha ignorado'); continue }
    bases.push({ ivaPb, baseCent, cuotaCent: aCentimos(b.cuota) })
  }
  const divisa = texto(r.divisa, 3)?.toUpperCase() ?? null
  return {
    ok: true, avisos,
    borrador: {
      nifEmisor: normalizarNif(r.nif_emisor), nombreEmisor: texto(r.nombre_emisor), nifReceptor: normalizarNif(r.nif_receptor),
      numero: texto(r.numero, 60), fecha: fechaDe(r.fecha), divisa, lineas, bases,
      retencionCent: r.retencion == null ? null : aCentimos(r.retencion), totalCent: aCentimos(r.total),
    },
  }
}

/** Instrucciones de extracción para la IA. Pide SOLO los campos del borrador: nada de direcciones, cuentas ni contactos. */
export const PROMPT_EXTRACCION_FACTURA = [
  'Eres un lector de facturas de proveedor españolas. Devuelve SOLO un JSON con esta forma exacta:',
  '{"nif_emisor":string|null,"nombre_emisor":string|null,"nif_receptor":string|null,"numero":string|null,"fecha":"AAAA-MM-DD"|null,',
  '"divisa":"EUR"|string|null,"lineas":[{"referencia":string|null,"descripcion":string,"cantidad":number|null,"precio_unitario":number|null,',
  '"iva_porcentaje":number|null,"importe":number|null}],"bases":[{"iva_porcentaje":number,"base":number,"cuota":number|null}],',
  '"retencion":number|null,"total":number|null}',
  'Reglas: importes en euros SIN IVA salvo "total" (importe a pagar con IVA y menos retención). "importe" = base de la línea tras descuentos.',
  'Si un dato no aparece, pon null: NO inventes ni pongas 0. No incluyas direcciones, teléfonos, correos ni cuentas bancarias.',
].join('\n')

/**
 * Minimiza el texto de un PDF antes de mandarlo a la IA: quita IBAN, correos y teléfonos (no hacen falta para el borrador) y lo
 * recorta. Los NIF se conservan (son parte del case).
 */
export function minimizarTextoFactura(t: string, max = 12_000): string {
  return t
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, '[cuenta]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[correo]')
    .replace(/(?:\+34[\s-]?)?\b[6789]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, '[teléfono]')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}
