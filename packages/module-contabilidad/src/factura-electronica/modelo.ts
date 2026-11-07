// Factura EMITIDA para la factura electrónica (UBL 2.1 EN 16931 y Facturae 3.2.2). PURO, céntimos enteros, sin float.
//
// El módulo no guardaba hasta ahora la factura emitida como entidad (las ventas entran como `HechoVenta`): este es su modelo de INTERCAMBIO.
// Cantidades en MILÉSIMAS (1000 = 1 unidad) y precio unitario en céntimos → base de línea = round(cantidad × precio / 1000) − descuento, todo entero.
// Las cuotas se calculan por TIPO de IVA sobre la suma de bases de ese tipo (práctica habitual y la que cuadra con el modelo 303); la retención de IRPF
// se calcula sobre la base total. Total = base + cuota; a pagar = total − retención.
import { ErrorContable, porcentajeDe, validarCentimos, type Centimos } from '../partida/dinero.ts'
import { esFechaISO } from '../partida/asiento.ts'

export type Direccion = { calle: string; codigoPostal: string; municipio: string; provincia: string; /** ISO 3166-1 alfa-3 para Facturae («ESP»). */ pais?: string }
export type ParteFactura = {
  nif: string
  /** Razón social (persona jurídica) o nombre completo (persona física, solo para UBL). */
  nombre: string
  personaFisica?: boolean
  /** Obligatorio en Facturae para persona física. */
  persona?: { nombre: string; apellido1: string; apellido2?: string }
  direccion: Direccion
  email?: string
}
export type LineaFacturaElectronica = {
  descripcion: string
  /** 1000 = 1 unidad. */
  cantidadMilesimas: number
  /** Precio unitario SIN impuestos, en céntimos. */
  precioUnitario: Centimos
  /** Descuento de línea en céntimos (≥ 0, ≤ importe bruto). */
  descuento?: Centimos
  tipoIva: number
  /** Motivo de exención/no sujeción cuando el tipo es 0 (sin él, el 0 % se declara como «tipo cero»). */
  exencion?: string
}
export type PlazoPago = { vencimiento: string; iban?: string; medio: 'transferencia' | 'efectivo' | 'tarjeta' | 'domiciliacion' }
export type FacturaElectronica = {
  serie?: string
  numero: string
  fecha: string
  tipo: 'ordinaria' | 'rectificativa'
  /** Obligatorio si es rectificativa. */
  rectifica?: { numero: string; fecha: string; motivo: string }
  emisor: ParteFactura
  receptor: ParteFactura
  lineas: readonly LineaFacturaElectronica[]
  /** IRPF retenido en %, sobre la base. Solo Facturae (UBL EN 16931 no lo representa). */
  retencionPct?: number
  pago?: PlazoPago
  observaciones?: string
}

export type DesgloseIva = { tipoIva: number; base: Centimos; cuota: Centimos; exencion?: string }
export type LineaCalculada = LineaFacturaElectronica & { bruto: Centimos; descuento: Centimos; base: Centimos }
export type TotalesFacturaElectronica = {
  lineas: LineaCalculada[]
  bruto: Centimos
  descuentos: Centimos
  base: Centimos
  desglose: DesgloseIva[]
  cuota: Centimos
  retencion: Centimos
  total: Centimos
  aPagar: Centimos
}

export const TIPOS_IVA_FACTURA = [21, 10, 5, 4, 2, 0] as const
const NIF_RE = /^[A-Z0-9]{8,12}$/

function brutoLinea(l: LineaFacturaElectronica): Centimos {
  if (!Number.isSafeInteger(l.cantidadMilesimas) || l.cantidadMilesimas <= 0) throw new ErrorContable('cantidad_invalida', `«${l.descripcion}»: la cantidad debe ser un entero positivo en milésimas`)
  validarCentimos(l.precioUnitario, 'precio unitario')
  const x = l.cantidadMilesimas * l.precioUnitario
  if (!Number.isSafeInteger(x)) throw new ErrorContable('importe_excesivo', `«${l.descripcion}»: importe fuera de rango`)
  // Redondeo al céntimo, mitades alejándose de cero, con aritmética entera.
  const abs = Math.abs(x), q = Math.floor(abs / 1000), r = abs % 1000
  return Math.sign(x) * (q + (r >= 500 ? 1 : 0))
}

export function calcularFacturaElectronica(f: Pick<FacturaElectronica, 'lineas' | 'retencionPct'>): TotalesFacturaElectronica {
  if (f.lineas.length === 0) throw new ErrorContable('sin_lineas', 'la factura no tiene líneas')
  const lineas: LineaCalculada[] = f.lineas.map((l) => {
    const bruto = brutoLinea(l), descuento = l.descuento ?? 0
    validarCentimos(descuento, 'descuento')
    if (descuento < 0 || descuento > Math.max(bruto, 0)) throw new ErrorContable('descuento_invalido', `«${l.descripcion}»: descuento fuera de rango`)
    if (!(TIPOS_IVA_FACTURA as readonly number[]).includes(l.tipoIva)) throw new ErrorContable('tipo_iva_invalido', `«${l.descripcion}»: tipo de IVA ${l.tipoIva} no admitido`)
    return { ...l, bruto, descuento, base: bruto - descuento }
  })
  const por = new Map<string, DesgloseIva>()
  for (const l of lineas) {
    // Un 0 % con motivo de exención es OTRA categoría que un 0 % sin motivo: no se mezclan.
    const clave = `${l.tipoIva}|${l.tipoIva === 0 ? (l.exencion ?? '') : ''}`
    const x = por.get(clave) ?? { tipoIva: l.tipoIva, base: 0, cuota: 0, ...(l.tipoIva === 0 && l.exencion ? { exencion: l.exencion } : {}) }
    x.base += l.base
    por.set(clave, x)
  }
  const desglose = [...por.values()].map((d) => ({ ...d, cuota: porcentajeDe(d.base, d.tipoIva) })).sort((a, b) => b.tipoIva - a.tipoIva || (a.exencion ?? '').localeCompare(b.exencion ?? ''))
  const bruto = lineas.reduce((s, l) => s + l.bruto, 0), descuentos = lineas.reduce((s, l) => s + l.descuento, 0)
  const base = lineas.reduce((s, l) => s + l.base, 0), cuota = desglose.reduce((s, d) => s + d.cuota, 0)
  if (f.retencionPct !== undefined && (!(f.retencionPct >= 0 && f.retencionPct <= 100) || !Number.isFinite(f.retencionPct))) throw new ErrorContable('retencion_invalida', 'retención fuera de 0-100 %')
  const retencion = f.retencionPct ? porcentajeDe(base, f.retencionPct) : 0
  const total = base + cuota
  return { lineas, bruto, descuentos, base, desglose, cuota, retencion, total, aPagar: total - retencion }
}

/** Lista de problemas de forma (no lanza). Vacía = la factura puede generarse. */
export function problemasFacturaElectronica(f: FacturaElectronica): string[] {
  const p: string[] = []
  if (!f.numero?.trim() || f.numero.length > 20) p.push('número de factura obligatorio (máximo 20 caracteres)')
  if (f.serie !== undefined && (!f.serie.trim() || f.serie.length > 20)) p.push('serie de la factura no válida')
  if (!esFechaISO(f.fecha)) p.push('fecha de la factura no válida')
  for (const [rol, x] of [['emisor', f.emisor], ['receptor', f.receptor]] as const) {
    if (!NIF_RE.test(x?.nif ?? '')) p.push(`${rol}: NIF no válido`)
    if (!x?.nombre?.trim()) p.push(`${rol}: nombre o razón social obligatorio`)
    const d = x?.direccion
    if (!d?.calle?.trim() || !d?.municipio?.trim() || !d?.provincia?.trim()) p.push(`${rol}: dirección incompleta (calle, municipio y provincia)`)
    if (!/^[0-9]{5}$/.test(d?.codigoPostal ?? '')) p.push(`${rol}: código postal de 5 cifras obligatorio`)
  }
  if (f.tipo === 'rectificativa') {
    if (!f.rectifica?.numero?.trim() || !esFechaISO(f.rectifica?.fecha) || !f.rectifica?.motivo?.trim()) p.push('una rectificativa necesita número, fecha y motivo de la factura que rectifica')
  } else if (f.rectifica) p.push('una factura ordinaria no puede indicar factura rectificada')
  if (f.pago && !esFechaISO(f.pago.vencimiento)) p.push('vencimiento no válido')
  if (f.pago?.medio === 'transferencia' && f.pago.iban !== undefined && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(f.pago.iban.replace(/\s/g, '').toUpperCase())) p.push('IBAN con formato no válido')
  try { calcularFacturaElectronica(f) } catch (e) { p.push(e instanceof ErrorContable ? e.message : 'importes no válidos') }
  return p
}

/** Resultado de un generador: el XML y lo que NO está hecho. */
export type XmlFactura = {
  xml: string
  formato: 'ubl-2.1-en16931' | 'facturae-3.2.2'
  /** Sin firma XAdES-EPES: pendiente (los puntos de entrada públicos, p. ej. FACe, la exigen). */
  firmado: false
  pendientes: string[]
}
export const PENDIENTE_XADES = 'Firma XAdES pendiente: el XML no está firmado y NO es válido para presentarlo en FACe hasta firmarlo con un certificado.'
export const PENDIENTE_CIUS_ES = 'Identificador del perfil CIUS-ES pendiente de contrastar: se usa el de EN 16931 puro (urn:cen.eu:en16931:2017).'
