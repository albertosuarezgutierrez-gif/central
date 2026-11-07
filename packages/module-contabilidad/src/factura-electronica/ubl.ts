// Generador UBL 2.1 · EN 16931 (CIUS-ES pendiente de contrastar). PURO. Elementos y orden según el esquema UBL 2.1 `Invoice`.
// Cubre los campos OBLIGATORIOS del modelo semántico EN 16931 (BT-1 número, BT-2 fecha, BT-3 tipo, BT-5 moneda, BG-4/BG-7 partes con nombre, dirección
// y país, BT-31/BT-48 identificador fiscal, BG-22 totales, BG-23 desglose de IVA con categoría y %, BG-25 líneas). NO está firmado.
// Retención de IRPF: EN 16931 no tiene concepto de retención; una factura con retención se rechaza aquí y debe ir en Facturae.
import { ErrorContable } from '../partida/dinero.ts'
import { calcularFacturaElectronica, PENDIENTE_CIUS_ES, PENDIENTE_XADES, problemasFacturaElectronica, type FacturaElectronica, type ParteFactura, type XmlFactura } from './modelo.ts'
import { el, importe, milesimas, porcentajeTxt } from './xml.ts'

export const UBL_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017'
export const UBL_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
const NS = 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'
const pais2 = (p?: string) => ({ ESP: 'ES', PRT: 'PT', FRA: 'FR', ITA: 'IT', DEU: 'DE' } as Record<string, string>)[(p ?? 'ESP').toUpperCase()] ?? (p ?? 'ES').slice(0, 2).toUpperCase()

function parte(p: ParteFactura, etiqueta: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
  const pais = pais2(p.direccion.pais)
  return `<cac:${etiqueta}><cac:Party>`
    + el('cbc:EndpointID', p.email ?? `${pais}${p.nif}`, `schemeID="${p.email ? 'EM' : '9920'}"`)
    + `<cac:PartyName>${el('cbc:Name', p.nombre)}</cac:PartyName>`
    + `<cac:PostalAddress>${el('cbc:StreetName', p.direccion.calle)}${el('cbc:CityName', p.direccion.municipio)}${el('cbc:PostalZone', p.direccion.codigoPostal)}${el('cbc:CountrySubentity', p.direccion.provincia)}<cac:Country>${el('cbc:IdentificationCode', pais)}</cac:Country></cac:PostalAddress>`
    + `<cac:PartyTaxScheme>${el('cbc:CompanyID', `${pais}${p.nif}`)}<cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme></cac:PartyTaxScheme>`
    + `<cac:PartyLegalEntity>${el('cbc:RegistrationName', p.nombre)}${el('cbc:CompanyID', p.nif)}</cac:PartyLegalEntity>`
    + `</cac:Party></cac:${etiqueta}>`
}
const MEDIO: Record<string, string> = { transferencia: '30', efectivo: '10', tarjeta: '48', domiciliacion: '59' }

export function generarUbl(f: FacturaElectronica): XmlFactura {
  const problemas = problemasFacturaElectronica(f)
  if (problemas.length) throw new ErrorContable('factura_no_valida', problemas.join('; '))
  if (f.retencionPct) throw new ErrorContable('retencion_no_soportada_en_ubl', 'UBL EN 16931 no representa la retención de IRPF: genera esta factura en Facturae')
  const t = calcularFacturaElectronica(f)
  const id = f.serie ? `${f.serie}${f.numero}` : f.numero
  const cat = (tipo: number, exencion?: string) => (tipo > 0 ? 'S' : exencion ? 'E' : 'Z')
  const lineas = t.lineas.map((l, i) => {
    return `<cac:InvoiceLine>${el('cbc:ID', String(i + 1))}${el('cbc:InvoicedQuantity', milesimas(l.cantidadMilesimas), 'unitCode="C62"')}${el('cbc:LineExtensionAmount', importe(l.base), 'currencyID="EUR"')}`
      + (l.descuento > 0 ? `<cac:AllowanceCharge>${el('cbc:ChargeIndicator', 'false')}${el('cbc:AllowanceChargeReason', 'Descuento')}${el('cbc:Amount', importe(l.descuento), 'currencyID="EUR"')}</cac:AllowanceCharge>` : '')
      + `<cac:Item>${el('cbc:Name', l.descripcion.slice(0, 200))}<cac:ClassifiedTaxCategory>${el('cbc:ID', cat(l.tipoIva, l.exencion))}${el('cbc:Percent', porcentajeTxt(l.tipoIva))}<cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`
      + `<cac:Price>${el('cbc:PriceAmount', importe(l.precioUnitario), 'currencyID="EUR"')}</cac:Price></cac:InvoiceLine>`
  }).join('')
  const subtotales = t.desglose.map((d) => `<cac:TaxSubtotal>${el('cbc:TaxableAmount', importe(d.base), 'currencyID="EUR"')}${el('cbc:TaxAmount', importe(d.cuota), 'currencyID="EUR"')}`
    + `<cac:TaxCategory>${el('cbc:ID', cat(d.tipoIva, d.exencion))}${el('cbc:Percent', porcentajeTxt(d.tipoIva))}${d.tipoIva === 0 && d.exencion ? el('cbc:TaxExemptionReason', d.exencion) : ''}<cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join('')
  const pago = f.pago
    ? `<cac:PaymentMeans>${el('cbc:PaymentMeansCode', MEDIO[f.pago.medio])}${el('cbc:PaymentDueDate', f.pago.vencimiento)}${f.pago.medio === 'transferencia' && f.pago.iban ? `<cac:PayeeFinancialAccount>${el('cbc:ID', f.pago.iban.replace(/\s/g, '').toUpperCase())}</cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>`
    : ''
  const rect = f.tipo === 'rectificativa' && f.rectifica
    ? `<cac:BillingReference><cac:InvoiceDocumentReference>${el('cbc:ID', f.rectifica.numero)}${el('cbc:IssueDate', f.rectifica.fecha)}</cac:InvoiceDocumentReference></cac:BillingReference>`
    : ''
  const notas = [f.observaciones, f.rectifica?.motivo].filter(Boolean).map((n) => el('cbc:Note', n as string)).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice ${NS}>`
    + el('cbc:CustomizationID', UBL_CUSTOMIZATION_ID) + el('cbc:ProfileID', UBL_PROFILE_ID)
    + el('cbc:ID', id) + el('cbc:IssueDate', f.fecha) + (f.pago ? el('cbc:DueDate', f.pago.vencimiento) : '')
    + el('cbc:InvoiceTypeCode', f.tipo === 'rectificativa' ? '384' : '380') + notas + el('cbc:DocumentCurrencyCode', 'EUR')
    + rect + parte(f.emisor, 'AccountingSupplierParty') + parte(f.receptor, 'AccountingCustomerParty') + pago
    + `<cac:TaxTotal>${el('cbc:TaxAmount', importe(t.cuota), 'currencyID="EUR"')}${subtotales}</cac:TaxTotal>`
    + `<cac:LegalMonetaryTotal>${el('cbc:LineExtensionAmount', importe(t.base), 'currencyID="EUR"')}${el('cbc:TaxExclusiveAmount', importe(t.base), 'currencyID="EUR"')}${el('cbc:TaxInclusiveAmount', importe(t.total), 'currencyID="EUR"')}${el('cbc:PayableAmount', importe(t.total), 'currencyID="EUR"')}</cac:LegalMonetaryTotal>`
    + lineas + '</Invoice>\n'
  return { xml, formato: 'ubl-2.1-en16931', firmado: false, pendientes: [PENDIENTE_XADES, PENDIENTE_CIUS_ES] }
}
