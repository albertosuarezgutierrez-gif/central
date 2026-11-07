// F6 · factura electrónica: totales exactos en céntimos y ESTRUCTURA de UBL 2.1 EN 16931 y Facturae 3.2.2 (campos obligatorios presentes, totales cuadran).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularFacturaElectronica, generarUbl, generarFacturae, problemasFacturaElectronica, PENDIENTE_XADES, type FacturaElectronica } from '../src/index.ts'

const emisor = { nif: 'B12345674', nombre: 'Talleres Ejemplo S.L.', direccion: { calle: 'Calle Mayor 1', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }, email: 'info@ejemplo.test' }
const receptor = { nif: '12345678Z', nombre: 'Ana Pérez Gil', personaFisica: true, persona: { nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil' }, direccion: { calle: 'Av. Sur 5 & 7', codigoPostal: '41010', municipio: 'Sevilla', provincia: 'Sevilla' } }
const base: FacturaElectronica = {
  serie: 'A', numero: '2026/45', fecha: '2026-03-15', tipo: 'ordinaria', emisor, receptor,
  lineas: [
    { descripcion: 'Mano de obra <revisión> & ajuste', cantidadMilesimas: 2500, precioUnitario: 4500, tipoIva: 21 },       // 2,5 h × 45 = 112,50
    { descripcion: 'Filtro', cantidadMilesimas: 1000, precioUnitario: 1999, descuento: 199, tipoIva: 21 },                // 19,99 − 1,99 = 18,00
    { descripcion: 'Libro', cantidadMilesimas: 3000, precioUnitario: 1333, tipoIva: 4 },                                  // 39,99
    { descripcion: 'Formación', cantidadMilesimas: 1000, precioUnitario: 5000, tipoIva: 0, exencion: 'Exenta art. 20 LIVA' },
  ],
  pago: { vencimiento: '2026-04-15', iban: 'ES91 2100 0418 4502 0005 1332', medio: 'transferencia' },
}

test('totales: base por línea entera, IVA por tipo sobre la suma de bases, total = base + cuota', () => {
  const t = calcularFacturaElectronica(base)
  assert.deepEqual(t.lineas.map((l) => l.base), [11250, 1800, 3999, 5000])
  assert.deepEqual(t.desglose.map((d) => [d.tipoIva, d.base, d.cuota]), [[21, 13050, 2741], [4, 3999, 160], [0, 5000, 0]])
  assert.equal(t.base, 22049)
  assert.equal(t.cuota, 2901)
  assert.equal(t.total, 24950)
  assert.equal(t.aPagar, 24950)
  assert.equal(t.desglose.reduce((s, d) => s + d.base, 0), t.base) // el desglose cuadra con las líneas
})

test('retención de IRPF: sobre la base total y se resta del importe a pagar', () => {
  const t = calcularFacturaElectronica({ ...base, retencionPct: 15 })
  assert.equal(t.retencion, 3307) // 15 % de 220,49 = 33,07
  assert.equal(t.aPagar, t.total - 3307)
})

test('redondeo de la línea: mitad de céntimo se aleja de cero; entradas inválidas lanzan', () => {
  const l = (cantidadMilesimas: number, precioUnitario: number) => calcularFacturaElectronica({ lineas: [{ descripcion: 'x', cantidadMilesimas, precioUnitario, tipoIva: 21 }] }).lineas[0].base
  assert.equal(l(500, 1), 1)  // 0,5 céntimo → 1
  assert.equal(l(499, 1), 0)
  assert.throws(() => l(0, 100), /cantidad/)
  assert.throws(() => l(1.5, 100), /cantidad/)
  assert.throws(() => calcularFacturaElectronica({ lineas: [] }), /no tiene líneas/)
  assert.throws(() => calcularFacturaElectronica({ lineas: [{ descripcion: 'x', cantidadMilesimas: 1000, precioUnitario: 100, descuento: 101, tipoIva: 21 }] }), /descuento/)
  assert.throws(() => calcularFacturaElectronica({ lineas: [{ descripcion: 'x', cantidadMilesimas: 1000, precioUnitario: 100, tipoIva: 7 }] }), /IVA 7/)
})

const campos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => m[1])

test('UBL 2.1 EN 16931: campos obligatorios presentes, escapado correcto, totales y desglose cuadran', () => {
  const r = generarUbl(base)
  const x = r.xml
  assert.equal(r.firmado, false)
  assert.ok(r.pendientes.includes(PENDIENTE_XADES))
  assert.ok(r.pendientes.some((p) => /CIUS-ES/.test(p)))
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/)
  for (const tag of ['cbc:CustomizationID', 'cbc:ID', 'cbc:IssueDate', 'cbc:InvoiceTypeCode', 'cbc:DocumentCurrencyCode', 'cac:AccountingSupplierParty', 'cac:AccountingCustomerParty', 'cac:TaxTotal', 'cac:LegalMonetaryTotal', 'cac:InvoiceLine']) assert.ok(x.includes(`<${tag}`), tag)
  assert.equal(campos(x, 'cbc:CustomizationID')[0], 'urn:cen.eu:en16931:2017')
  assert.equal(campos(x, 'cbc:InvoiceTypeCode')[0], '380')
  assert.equal(campos(x, 'cbc:DocumentCurrencyCode')[0], 'EUR')
  assert.equal(campos(x, 'cbc:ID')[0], 'A2026/45')
  assert.equal(campos(x, 'cbc:RegistrationName').length, 2)
  assert.deepEqual(campos(x, 'cbc:CompanyID'), ['ESB12345674', 'B12345674', 'ES12345678Z', '12345678Z'])
  assert.ok(x.includes('Mano de obra &lt;revisión&gt; &amp; ajuste'))
  assert.ok(x.includes('Av. Sur 5 &amp; 7'))
  assert.equal(campos(x, 'cbc:PayableAmount')[0], '249.50')
  assert.equal(campos(x, 'cbc:TaxInclusiveAmount')[0], '249.50')
  assert.equal(campos(x, 'cbc:TaxExclusiveAmount')[0], '220.49')
  // Suma de líneas = LineExtensionAmount del total; suma de subtotales = TaxAmount del TaxTotal.
  const lineas = campos(x.slice(x.indexOf('<cac:InvoiceLine>')), 'cbc:LineExtensionAmount').map((v) => Math.round(Number(v) * 100))
  assert.equal(lineas.reduce((s, n) => s + n, 0), 22049)
  assert.equal(campos(x.slice(0, x.indexOf('<cac:LegalMonetaryTotal>')), 'cbc:LineExtensionAmount').length, 0)
  const cuotas = campos(x.slice(x.indexOf('<cac:TaxTotal>'), x.indexOf('</cac:TaxTotal>')), 'cbc:TaxAmount').map((v) => Math.round(Number(v) * 100))
  assert.equal(cuotas[0], cuotas.slice(1).reduce((s, n) => s + n, 0))
  assert.equal(cuotas[0], 2901)
  // Categorías: S para 21/4, E con motivo para el exento.
  assert.deepEqual(campos(x.slice(x.indexOf('<cac:TaxTotal>'), x.indexOf('</cac:TaxTotal>')), 'cbc:ID').filter((v) => v !== 'VAT'), ['S', 'S', 'E'])
  assert.ok(x.includes('<cbc:TaxExemptionReason>Exenta art. 20 LIVA</cbc:TaxExemptionReason>'))
  assert.ok(x.includes('<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>'))
  assert.ok(x.includes('<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>'))
  assert.ok(x.includes('ES9121000418450200051332'))
})

test('UBL: rectificativa referencia la original (384); retención de IRPF y facturas inválidas se rechazan en vez de generar un XML engañoso', () => {
  const r = generarUbl({ ...base, tipo: 'rectificativa', rectifica: { numero: 'A2026/30', fecha: '2026-02-01', motivo: 'Error en el precio' } })
  assert.equal(campos(r.xml, 'cbc:InvoiceTypeCode')[0], '384')
  assert.ok(r.xml.includes('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>A2026/30</cbc:ID>'))
  assert.throws(() => generarUbl({ ...base, retencionPct: 15 }), /Facturae/)
  assert.throws(() => generarUbl({ ...base, numero: '' }), /número de factura/)
  assert.throws(() => generarUbl({ ...base, tipo: 'rectificativa' }), /rectifica/)
  assert.ok(problemasFacturaElectronica({ ...base, emisor: { ...emisor, nif: 'x' } }).some((p) => /emisor: NIF/.test(p)))
  assert.ok(problemasFacturaElectronica({ ...base, receptor: { ...receptor, direccion: { ...receptor.direccion, codigoPostal: '123' } } }).some((p) => /código postal/.test(p)))
})

test('Facturae 3.2.2: cabecera, partes (física con apellidos / jurídica), impuestos, retención, totales y plazos; totales cuadran', () => {
  const r = generarFacturae({ ...base, retencionPct: 15 })
  const x = r.xml
  assert.equal(r.firmado, false)
  assert.deepEqual(r.pendientes, [PENDIENTE_XADES])
  assert.match(x, /<fe:Facturae xmlns:ds="http:\/\/www.w3.org\/2000\/09\/xmldsig#" xmlns:fe="http:\/\/www.facturae.gob.es\/formato\/Versiones\/Facturaev3_2_2.xml">/)
  assert.equal(campos(x, 'SchemaVersion')[0], '3.2.2')
  assert.equal(campos(x, 'Modality')[0], 'I')
  assert.deepEqual(campos(x, 'TaxIdentificationNumber'), ['ESB12345674', 'ES12345678Z'])
  assert.deepEqual(campos(x, 'PersonTypeCode'), ['J', 'F'])
  assert.deepEqual([campos(x, 'Name')[0], campos(x, 'FirstSurname')[0], campos(x, 'SecondSurname')[0]], ['Ana', 'Pérez', 'Gil'])
  assert.equal(campos(x, 'CorporateName')[0], 'Talleres Ejemplo S.L.')
  assert.equal(campos(x, 'InvoiceNumber')[0], '2026/45')
  assert.equal(campos(x, 'InvoiceSeriesCode')[0], 'A')
  assert.equal(campos(x, 'IssueDate')[0], '2026-03-15')
  assert.equal(campos(x, 'InvoiceTotal')[0], '249.50')
  assert.equal(campos(x, 'TotalTaxOutputs')[0], '29.01')
  assert.equal(campos(x, 'TotalTaxesWithheld')[0], '33.07')
  assert.equal(campos(x, 'TotalGrossAmountBeforeTaxes')[0], '220.49')
  assert.equal(campos(x, 'TotalOutstandingAmount').pop(), '216.43') // 249,50 − 33,07
  assert.equal(campos(x, 'InstallmentAmount')[0], '216.43')
  assert.equal(campos(x, 'IBAN')[0], 'ES9121000418450200051332')
  assert.equal(campos(x, 'InstallmentDueDate')[0], '2026-04-15')
  assert.equal(campos(x, 'UnitPriceWithoutTax')[0], '45.000000')
  assert.equal(campos(x, 'Quantity')[0], '2.500')
  // Impuestos repercutidos de cabecera: suma de TaxAmount = TotalTaxOutputs.
  const cab = x.slice(x.indexOf('<TaxesOutputs>'), x.indexOf('</TaxesOutputs>'))
  const sumaCuotas = campos(cab, 'TotalAmount').filter((_, i) => i % 2 === 1).reduce((s, v) => s + Math.round(Number(v) * 100), 0)
  assert.equal(sumaCuotas, 2901)
  // Suma de GrossAmount de las líneas = TotalGrossAmount.
  assert.equal(campos(x, 'GrossAmount').reduce((s, v) => s + Math.round(Number(v) * 100), 0), Math.round(Number(campos(x, 'TotalGrossAmount')[0]) * 100))
  assert.ok(x.includes('<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>15.00</TaxRate>'))
  assert.ok(x.includes('Mano de obra &lt;revisión&gt; &amp; ajuste'))
})

test('Facturae: persona física sin nombre/apellido falla; rectificativa lleva el bloque Corrective; sin retención el bloque TaxesWithheld no existe', () => {
  assert.throws(() => generarFacturae({ ...base, receptor: { ...receptor, persona: undefined } }), /nombre y primer apellido/)
  const r = generarFacturae({ ...base, tipo: 'rectificativa', rectifica: { numero: 'A2026/30', fecha: '2026-02-01', motivo: 'Error' } })
  assert.ok(r.xml.includes('<InvoiceClass>OR</InvoiceClass>') && r.xml.includes('<Corrective>'))
  assert.ok(!generarFacturae(base).xml.includes('TaxesWithheld>') || campos(generarFacturae(base).xml, 'TotalTaxesWithheld')[0] === '0.00')
  assert.ok(!generarFacturae(base).xml.includes('<TaxesWithheld>'))
})
