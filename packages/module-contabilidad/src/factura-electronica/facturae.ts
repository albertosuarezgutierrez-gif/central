// Generador Facturae 3.2.2 (formato español de factura electrónica; administración pública vía FACe). PURO. Estructura según el esquema:
// FileHeader → Parties (SellerParty, BuyerParty) → Invoices/Invoice (InvoiceHeader, InvoiceIssueData, TaxesOutputs, TaxesWithheld, InvoiceTotals,
// Items, PaymentDetails). Importes con 2 decimales y precio unitario con 6, como pide el esquema. NO está firmado (XAdES-EPES pendiente).
import { ErrorContable } from '../partida/dinero.ts'
import { calcularFacturaElectronica, PENDIENTE_XADES, problemasFacturaElectronica, type FacturaElectronica, type ParteFactura, type XmlFactura } from './modelo.ts'
import { el, esc as esc2, importe, milesimas, porcentajeTxt } from './xml.ts'

export const FACTURAE_NS = 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml'
const MEDIO_PAGO: Record<string, string> = { efectivo: '01', domiciliacion: '02', transferencia: '04', tarjeta: '19' }

function direccion(p: ParteFactura): string {
  const d = p.direccion
  return `<AddressInSpain>${el('Address', d.calle)}${el('PostCode', d.codigoPostal)}${el('Town', d.municipio)}${el('Province', d.provincia)}${el('CountryCode', d.pais ?? 'ESP')}</AddressInSpain>`
}
function parte(p: ParteFactura, rol: string): string {
  const fisica = p.personaFisica === true
  if (fisica && !p.persona) throw new ErrorContable('persona_fisica_sin_nombre', `${rol}: una persona física necesita nombre y primer apellido`)
  const ident = `<TaxIdentification>${el('PersonTypeCode', fisica ? 'F' : 'J')}${el('ResidenceTypeCode', 'R')}${el('TaxIdentificationNumber', `ES${p.nif}`)}</TaxIdentification>`
  const cuerpo = fisica
    ? `<Individual>${el('Name', p.persona!.nombre)}${el('FirstSurname', p.persona!.apellido1)}${p.persona!.apellido2 ? el('SecondSurname', p.persona!.apellido2) : ''}${direccion(p)}${p.email ? `<ContactDetails>${el('ElectronicMail', p.email)}</ContactDetails>` : ''}</Individual>`
    : `<LegalEntity>${el('CorporateName', p.nombre)}${direccion(p)}${p.email ? `<ContactDetails>${el('ElectronicMail', p.email)}</ContactDetails>` : ''}</LegalEntity>`
  return ident + cuerpo
}
const euros = (c: number) => importe(c)

export function generarFacturae(f: FacturaElectronica): XmlFactura {
  const problemas = problemasFacturaElectronica(f)
  if (problemas.length) throw new ErrorContable('factura_no_valida', problemas.join('; '))
  const t = calcularFacturaElectronica(f)
  const rectificativa = f.tipo === 'rectificativa'
  const cabecera = `<InvoiceHeader>${el('InvoiceNumber', f.numero)}${f.serie ? el('InvoiceSeriesCode', f.serie) : ''}${el('InvoiceDocumentType', 'FC')}${el('InvoiceClass', rectificativa ? 'OR' : 'OO')}`
    + (rectificativa && f.rectifica
      ? `<Corrective>${el('InvoiceNumber', f.rectifica.numero)}${el('ReasonCode', '16')}${el('ReasonDescription', f.rectifica.motivo)}<TaxPeriod>${el('StartDate', f.rectifica.fecha)}${el('EndDate', f.rectifica.fecha)}</TaxPeriod>${el('CorrectionMethod', '01')}${el('CorrectionMethodDescription', 'Rectificación íntegra')}</Corrective>`
      : '')
    + '</InvoiceHeader>'
  const emision = `<InvoiceIssueData>${el('IssueDate', f.fecha)}${el('InvoiceCurrencyCode', 'EUR')}${el('TaxCurrencyCode', 'EUR')}${el('LanguageName', 'es')}</InvoiceIssueData>`
  const impuestos = t.desglose.map((d) => `<Tax>${el('TaxTypeCode', '01')}${el('TaxRate', porcentajeTxt(d.tipoIva))}<TaxableBase>${el('TotalAmount', euros(d.base))}</TaxableBase><TaxAmount>${el('TotalAmount', euros(d.cuota))}</TaxAmount></Tax>`).join('')
  const retenido = t.retencion > 0 && f.retencionPct
    ? `<TaxesWithheld><Tax>${el('TaxTypeCode', '04')}${el('TaxRate', porcentajeTxt(f.retencionPct))}<TaxableBase>${el('TotalAmount', euros(t.base))}</TaxableBase><TaxAmount>${el('TotalAmount', euros(t.retencion))}</TaxAmount></Tax></TaxesWithheld>`
    : ''
  const totales = `<InvoiceTotals>${el('TotalGrossAmount', euros(t.base))}`
    + `${el('TotalGeneralDiscounts', euros(0))}${el('TotalGeneralSurcharges', euros(0))}${el('TotalGrossAmountBeforeTaxes', euros(t.base))}${el('TotalTaxOutputs', euros(t.cuota))}${el('TotalTaxesWithheld', euros(t.retencion))}`
    + `${el('InvoiceTotal', euros(t.total))}${el('TotalOutstandingAmount', euros(t.aPagar))}${el('TotalExecutableAmount', euros(t.aPagar))}</InvoiceTotals>`
  const items = t.lineas.map((l) => `<InvoiceLine>${el('ItemDescription', l.descripcion.slice(0, 2500))}${el('Quantity', milesimas(l.cantidadMilesimas))}${el('UnitOfMeasure', '01')}${el('UnitPriceWithoutTax', importe(l.precioUnitario, 6))}${el('TotalCost', euros(l.bruto))}`
    + (l.descuento > 0 ? `<DiscountsAndRebates><Discount>${el('DiscountReason', 'Descuento')}${el('DiscountRate', '0.0000')}${el('DiscountAmount', euros(l.descuento))}</Discount></DiscountsAndRebates>` : '')
    + `${el('GrossAmount', euros(l.base))}<TaxesOutputs><Tax>${el('TaxTypeCode', '01')}${el('TaxRate', porcentajeTxt(l.tipoIva))}<TaxableBase>${el('TotalAmount', euros(l.base))}</TaxableBase></Tax></TaxesOutputs>`
    + `${l.tipoIva === 0 && l.exencion ? `<AdditionalLineItemInformation>${esc2(l.exencion)}</AdditionalLineItemInformation>` : ''}</InvoiceLine>`).join('')
  const pago = f.pago
    ? `<PaymentDetails><Installment>${el('InstallmentDueDate', f.pago.vencimiento)}${el('InstallmentAmount', euros(t.aPagar))}${el('PaymentMeans', MEDIO_PAGO[f.pago.medio])}`
      + `${f.pago.medio === 'transferencia' && f.pago.iban ? `<AccountToBeCredited>${el('IBAN', f.pago.iban.replace(/\s/g, '').toUpperCase())}</AccountToBeCredited>` : ''}</Installment></PaymentDetails>`
    : ''
  const legal = (f.observaciones ? `<AdditionalData>${el('InvoiceAdditionalInformation', f.observaciones)}</AdditionalData>` : '')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<fe:Facturae xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:fe="${FACTURAE_NS}">`
    + `<FileHeader>${el('SchemaVersion', '3.2.2')}${el('Modality', 'I')}${el('InvoiceIssuerType', 'EM')}<Batch>${el('BatchIdentifier', `${f.emisor.nif}${f.serie ?? ''}${f.numero}`.slice(0, 70))}${el('InvoicesCount', '1')}`
    + `<TotalInvoicesAmount>${el('TotalAmount', euros(t.total))}</TotalInvoicesAmount><TotalOutstandingAmount>${el('TotalAmount', euros(t.aPagar))}</TotalOutstandingAmount><TotalExecutableAmount>${el('TotalAmount', euros(t.aPagar))}</TotalExecutableAmount>${el('InvoiceCurrencyCode', 'EUR')}</Batch></FileHeader>`
    + `<Parties><SellerParty>${parte(f.emisor, 'emisor')}</SellerParty><BuyerParty>${parte(f.receptor, 'receptor')}</BuyerParty></Parties>`
    + `<Invoices><Invoice>${cabecera}${emision}<TaxesOutputs>${impuestos}</TaxesOutputs>${retenido}${totales}<Items>${items}</Items>${pago}${legal}</Invoice></Invoices></fe:Facturae>\n`
  return { xml, formato: 'facturae-3.2.2', firmado: false, pendientes: [PENDIENTE_XADES] }
}

