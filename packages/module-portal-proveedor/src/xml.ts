// Lectura DETERMINISTA de facturas electrónicas XML (Facturae 3.2.x y UBL 2.x) → `ExtraccionCruda`. PURO.
// Minimización de datos: una factura XML no se manda a la IA si este lector la entiende. Si no la entiende, `xmlMinimizado` deja
// solo los elementos útiles (sin firma, adjuntos, direcciones, contactos ni cuentas) para el respaldo por IA.
// Parser mínimo y acotado (nodos y profundidad): la subida ya rechazó DOCTYPE/ENTITY (`xmlPeligroso`).
import type { ExtraccionCruda } from './borrador.ts'

export interface NodoXml { n: string; hijos: NodoXml[]; texto: string }
const MAX_NODOS = 50_000
const MAX_PROFUNDIDAD = 64

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m)
const local = (q: string) => q.slice(q.indexOf(':') + 1)

/** Árbol de nombres LOCALES (sin prefijo de espacio de nombres) y texto. null si el XML está mal formado o es demasiado grande. */
export function parsearXml(xml: string): NodoXml | null {
  const limpio = xml.replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  if (/<!DOCTYPE|<!ENTITY/i.test(limpio)) return null
  const raiz: NodoXml = { n: '#raiz', hijos: [], texto: '' }
  const pila: NodoXml[] = [raiz]
  let nodos = 0
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) {
    const actual = pila[pila.length - 1]
    if (m[1] !== undefined) { actual.texto += m[1]; continue }
    if (m[6] !== undefined) { actual.texto += decodificar(m[6]); continue }
    const nombre = local(m[3])
    if (m[2] === '/') {
      if (pila.length < 2 || actual.n !== nombre) return null
      pila.pop()
      continue
    }
    if (++nodos > MAX_NODOS || pila.length > MAX_PROFUNDIDAD) return null
    const nuevo: NodoXml = { n: nombre, hijos: [], texto: '' }
    actual.hijos.push(nuevo)
    if (m[5] !== '/') pila.push(nuevo)
  }
  if (pila.length !== 1 || raiz.hijos.length !== 1) return null
  return raiz.hijos[0]
}

// ─── Consultas por ruta de nombres locales ───────────────────────────────────
const hijos = (n: NodoXml | null | undefined, nombre: string) => (n ? n.hijos.filter((h) => h.n === nombre) : [])
function en(n: NodoXml | null | undefined, ...ruta: string[]): NodoXml | null {
  let x: NodoXml | null | undefined = n
  for (const p of ruta) x = hijos(x, p)[0]
  return x ?? null
}
const val = (n: NodoXml | null | undefined, ...ruta: string[]): string | null => {
  const x = en(n, ...ruta)
  const t = x?.texto.trim()
  return t ? t : null
}
const num = (s: string | null): number | null => (s == null || !/^-?\d+(\.\d+)?$/.test(s) ? null : Number(s))

// ─── Facturae 3.2.x ──────────────────────────────────────────────────────────
function facturae(r: NodoXml): ExtraccionCruda | null {
  const facturas = hijos(en(r, 'Invoices'), 'Invoice')
  if (facturas.length !== 1) return null // un lote de varias facturas no se casa contra UN albarán
  const f = facturas[0]
  const vendedor = en(r, 'Parties', 'SellerParty')
  const serie = val(f, 'InvoiceHeader', 'InvoiceSeriesCode') ?? ''
  const nombre = val(vendedor, 'LegalEntity', 'CorporateName') ?? [val(vendedor, 'Individual', 'Name'), val(vendedor, 'Individual', 'FirstSurname')].filter(Boolean).join(' ')
  const tasasIva = (n: NodoXml | null) => hijos(en(n, 'TaxesOutputs'), 'Tax').filter((t) => (val(t, 'TaxTypeCode') ?? '01') === '01')
  const lineas = hijos(en(f, 'Items'), 'InvoiceLine').map((l) => ({
    referencia: val(l, 'ArticleCode') ?? val(l, 'SellerReference') ?? null,
    descripcion: val(l, 'ItemDescription'),
    cantidad: num(val(l, 'Quantity')),
    precio_unitario: num(val(l, 'UnitPriceWithoutTax')),
    iva_porcentaje: num(val(tasasIva(l)[0], 'TaxRate')),
    importe: num(val(l, 'GrossAmount') ?? val(l, 'TotalCost')),
  }))
  const bases = tasasIva(f).map((t) => ({
    iva_porcentaje: num(val(t, 'TaxRate')), base: num(val(t, 'TaxableBase', 'TotalAmount')), cuota: num(val(t, 'TaxAmount', 'TotalAmount')),
  }))
  const retenido = hijos(en(f, 'TaxesWithheld'), 'Tax').reduce<number | null>((s, t) => {
    const x = num(val(t, 'TaxAmount', 'TotalAmount'))
    return x == null ? s : (s ?? 0) + x
  }, null)
  return {
    nif_emisor: val(vendedor, 'TaxIdentification', 'TaxIdentificationNumber'),
    nombre_emisor: nombre || null,
    nif_receptor: val(r, 'Parties', 'BuyerParty', 'TaxIdentification', 'TaxIdentificationNumber'),
    numero: (serie + (val(f, 'InvoiceHeader', 'InvoiceNumber') ?? '')) || null,
    fecha: val(f, 'InvoiceIssueData', 'IssueDate'),
    divisa: val(f, 'InvoiceIssueData', 'InvoiceCurrencyCode'),
    lineas, bases, retencion: retenido ?? num(val(f, 'InvoiceTotals', 'TotalTaxesWithheld')) ?? 0,
    total: num(val(f, 'InvoiceTotals', 'InvoiceTotal')),
  }
}

// ─── UBL 2.x ─────────────────────────────────────────────────────────────────
function idFiscal(party: NodoXml | null): string | null {
  return val(party, 'PartyTaxScheme', 'CompanyID') ?? val(party, 'PartyLegalEntity', 'CompanyID') ?? val(party, 'PartyIdentification', 'ID')
}
function ubl(r: NodoXml): ExtraccionCruda | null {
  const prov = en(r, 'AccountingSupplierParty', 'Party')
  const cli = en(r, 'AccountingCustomerParty', 'Party')
  const lineas = hijos(r, 'InvoiceLine').map((l) => {
    const item = en(l, 'Item')
    return {
      referencia: val(item, 'SellersItemIdentification', 'ID') ?? val(item, 'StandardItemIdentification', 'ID'),
      descripcion: val(item, 'Name') ?? val(item, 'Description'),
      cantidad: num(val(l, 'InvoicedQuantity')),
      precio_unitario: (() => {
        const p = num(val(l, 'Price', 'PriceAmount')), bq = num(val(l, 'Price', 'BaseQuantity'))
        return p == null ? null : bq && bq > 0 ? p / bq : p
      })(),
      iva_porcentaje: num(val(item, 'ClassifiedTaxCategory', 'Percent')),
      importe: num(val(l, 'LineExtensionAmount')),
    }
  })
  const subtotales = hijos(r, 'TaxTotal').flatMap((t) => hijos(t, 'TaxSubtotal'))
  const bases = subtotales.map((s) => ({
    iva_porcentaje: num(val(s, 'TaxCategory', 'Percent') ?? val(s, 'Percent')), base: num(val(s, 'TaxableAmount')), cuota: num(val(s, 'TaxAmount')),
  }))
  const retenciones = hijos(r, 'WithholdingTaxTotal').map((w) => num(val(w, 'TaxAmount')))
  const retencion = retenciones.length ? retenciones.reduce<number>((s, x) => s + (x ?? 0), 0) : 0
  const conIva = num(val(r, 'LegalMonetaryTotal', 'TaxInclusiveAmount'))
  const total = retenciones.length && conIva != null ? conIva - retencion : num(val(r, 'LegalMonetaryTotal', 'PayableAmount')) ?? conIva
  return {
    nif_emisor: idFiscal(prov), nombre_emisor: val(prov, 'PartyLegalEntity', 'RegistrationName') ?? val(prov, 'PartyName', 'Name'),
    nif_receptor: idFiscal(cli), numero: val(r, 'ID'), fecha: val(r, 'IssueDate'), divisa: val(r, 'DocumentCurrencyCode'),
    lineas, bases, retencion, total: total == null ? null : Math.round(total * 100) / 100,
  }
}

/** XML → extracción cruda (misma forma que la IA). null si no es Facturae ni UBL Invoice reconocible. */
export function leerFacturaXml(xml: string): ExtraccionCruda | null {
  const r = parsearXml(xml)
  if (!r) return null
  if (r.n === 'Facturae') return facturae(r)
  if (r.n === 'Invoice') return ubl(r)
  return null
}

/** Elementos que NO se mandan a la IA (no hacen falta para el borrador). */
const FUERA = [
  'Signature', 'UBLExtensions', 'AdditionalDocumentReference', 'Attachment', 'AttachedDocument', 'EmbeddedDocumentBinaryObject',
  'Address', 'AddressInSpain', 'OverseasAddress', 'PostalAddress', 'ContactDetails', 'Contact', 'PaymentMeans', 'PaymentDetails',
  'Installment', 'AccountToBeCredited', 'AccountToBeDebited', 'PayeeFinancialAccount', 'Delivery', 'DeliveryNotesReferences',
]
/** Texto compacto «Ruta: valor» sin los elementos de `FUERA`, para el respaldo por IA. null si el XML no se puede leer. */
export function xmlMinimizado(xml: string, max = 12_000): string | null {
  const r = parsearXml(xml)
  if (!r) return null
  const out: string[] = []
  const ir = (n: NodoXml, ruta: string) => {
    for (const h of n.hijos) {
      if (FUERA.includes(h.n)) continue
      const p = ruta ? `${ruta}/${h.n}` : h.n
      const t = h.texto.trim()
      if (t && h.hijos.length === 0) out.push(`${p}: ${t.slice(0, 200)}`)
      ir(h, p)
    }
  }
  ir(r, '')
  return out.join('\n').slice(0, max)
}
