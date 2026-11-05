// Borrador de factura recibida desde la IA y desde XML (Facturae / UBL). Cepos vistos FALLAR (05/11/2026) y restaurados:
// (1) en mapearExtraccion poner `?? 0` al total → rojo «lo que falta es null, nunca 0».
// (2) en aCentimos usar `Math.round(n * 100)` sin toFixed → rojo «0,29 € son 29 céntimos» (no 28).
// (3) en xmlMinimizado quitar el filtro `FUERA.includes(h.n)` → rojo «la cuenta bancaria no viaja a la IA».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aCentimos, casarTresBandas, fechaDe, leerFacturaXml, mapearExtraccion, minimizarTextoFactura, normalizarNif, numeroDe, xmlMinimizado } from '../src/index.ts'

test('números españoles y anglosajones; 0,29 € son 29 céntimos', () => {
  assert.equal(numeroDe('1.234,56'), 1234.56)
  assert.equal(numeroDe('1,234.56'), 1234.56)
  assert.equal(numeroDe('12,5 €'), 12.5)
  assert.equal(numeroDe('abc'), null)
  assert.equal(aCentimos(0.29), 29)
  assert.equal(aCentimos('1.234,56'), 123456)
  assert.equal(aCentimos(1.005), 101)
})
test('NIF y fecha', () => {
  assert.equal(normalizarNif('es b-41.234.567'), 'B41234567')
  assert.equal(normalizarNif(''), null)
  assert.equal(fechaDe('03/11/2026'), '2026-11-03')
  assert.equal(fechaDe('2026-02-30'), null)
})
test('lo que falta es null, nunca 0', () => {
  const r = mapearExtraccion({ nif_emisor: 'B41234567', numero: 'F1', lineas: [{ descripcion: 'Filtro', cantidad: 4 }] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.borrador.totalCent, null)
  assert.equal(r.borrador.retencionCent, null)
  assert.equal(r.borrador.fecha, null)
  assert.deepEqual(r.borrador.lineas[0], { clave: null, descripcion: 'Filtro', cantidadMil: 4000, precioUnitCent: null, ivaPb: null, importeCent: null })
  assert.equal(mapearExtraccion('texto').ok, false)
  assert.equal(mapearExtraccion([1]).ok, false)
})
test('texto del PDF minimizado: sin cuenta, correo ni teléfono; con NIF', () => {
  const t = minimizarTextoFactura('Recambios Sur B41234567\nIBAN ES91 2100 0418 4502 0005 1332\nventas@recambiossur.es  Tel. 954 123 456\nTotal 79,86')
  assert.ok(t.includes('B41234567'))
  assert.ok(!t.includes('2100 0418'))
  assert.ok(!t.includes('@'))
  assert.ok(!t.includes('954 123 456'))
  assert.ok(t.includes('79,86'))
})

const FACTURAE = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
 <FileHeader><SchemaVersion>3.2.2</SchemaVersion></FileHeader>
 <Parties>
  <SellerParty><TaxIdentification><PersonTypeCode>J</PersonTypeCode><TaxIdentificationNumber>ESB29876543</TaxIdentificationNumber></TaxIdentification>
   <LegalEntity><CorporateName>Saneamientos del Sur S.L.</CorporateName><AddressInSpain><Address>Calle Falsa 1</Address></AddressInSpain></LegalEntity></SellerParty>
  <BuyerParty><TaxIdentification><TaxIdentificationNumber>B90000000</TaxIdentificationNumber></TaxIdentification></BuyerParty>
 </Parties>
 <Invoices><Invoice>
  <InvoiceHeader><InvoiceNumber>0042</InvoiceNumber><InvoiceSeriesCode>A</InvoiceSeriesCode></InvoiceHeader>
  <InvoiceIssueData><IssueDate>2026-10-30</IssueDate><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode></InvoiceIssueData>
  <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate><TaxableBase><TotalAmount>55.45</TotalAmount></TaxableBase><TaxAmount><TotalAmount>11.64</TotalAmount></TaxAmount></Tax></TaxesOutputs>
  <InvoiceTotals><TotalGrossAmountBeforeTaxes>55.45</TotalGrossAmountBeforeTaxes><InvoiceTotal>67.09</InvoiceTotal></InvoiceTotals>
  <Items>
   <InvoiceLine><ArticleCode>MC1620</ArticleCode><ItemDescription>Tubo multicapa 16x2 &amp; aislante</ItemDescription><Quantity>25</Quantity><UnitPriceWithoutTax>1.85</UnitPriceWithoutTax><TotalCost>46.25</TotalCost><GrossAmount>46.25</GrossAmount>
    <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate></Tax></TaxesOutputs></InvoiceLine>
   <InvoiceLine><ArticleCode>CD16</ArticleCode><ItemDescription><![CDATA[Codo 90 <prensar> 16]]></ItemDescription><Quantity>10</Quantity><UnitPriceWithoutTax>0.92</UnitPriceWithoutTax><TotalCost>9.20</TotalCost>
    <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate></Tax></TaxesOutputs></InvoiceLine>
  </Items>
  <PaymentDetails><Installment><AccountToBeCredited><IBAN>ES9121000418450200051332</IBAN></AccountToBeCredited></Installment></PaymentDetails>
 </Invoice></Invoices>
 <ds:Signature><ds:SignatureValue>AAAA</ds:SignatureValue></ds:Signature>
</fe:Facturae>`

test('Facturae (fontanería) se lee SIN IA y casa a tres bandas', () => {
  const raw = leerFacturaXml(FACTURAE)
  assert.ok(raw)
  const m = mapearExtraccion(raw)
  assert.ok(m.ok)
  if (!m.ok) return
  const b = m.borrador
  assert.equal(b.nifEmisor, 'B29876543')
  assert.equal(b.numero, 'A0042')
  assert.equal(b.totalCent, 6709)
  assert.equal(b.retencionCent, 0)
  assert.equal(b.lineas[0].descripcion, 'Tubo multicapa 16x2 & aislante')
  assert.equal(b.lineas[1].descripcion, 'Codo 90 <prensar> 16')
  assert.deepEqual(b.bases, [{ ivaPb: 2100, baseCent: 5545, cuotaCent: 1164 }])
  const pedido = [
    { id: 'p1', clave: 'MC1620', descripcion: 'Tubo multicapa', cantidadMil: 25000, precioUnitCent: 185, ivaPb: 2100 },
    { id: 'p2', clave: 'CD16', descripcion: 'Codo', cantidadMil: 10000, precioUnitCent: 92, ivaPb: 2100 },
  ]
  const r = casarTresBandas({ nifProveedor: 'B29876543', pedido, albaran: pedido.map((p) => ({ ...p, id: `a-${p.id}`, pedidoLineaId: p.id })), factura: b })
  assert.equal(r.cuadra, true, JSON.stringify(r.diferencias))
})

const UBL = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
 <cbc:ID>F-2026-118</cbc:ID><cbc:IssueDate>2026-11-03</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
 <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>ESB41234567</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Recambios Sur SL</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
 <cac:TaxTotal><cbc:TaxAmount>13.86</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount>66.00</cbc:TaxableAmount><cbc:TaxAmount>13.86</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>21</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
 <cac:LegalMonetaryTotal><cbc:TaxInclusiveAmount>79.86</cbc:TaxInclusiveAmount><cbc:PayableAmount>79.86</cbc:PayableAmount></cac:LegalMonetaryTotal>
 <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">4</cbc:InvoicedQuantity><cbc:LineExtensionAmount>26.00</cbc:LineExtensionAmount>
  <cac:Item><cbc:Name>Filtro aceite</cbc:Name><cac:SellersItemIdentification><cbc:ID>W712/75</cbc:ID></cac:SellersItemIdentification><cac:ClassifiedTaxCategory><cbc:Percent>21</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
  <cac:Price><cbc:PriceAmount>6.50</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
 <cac:InvoiceLine><cbc:ID>2</cbc:ID><cbc:InvoicedQuantity unitCode="LTR">5</cbc:InvoicedQuantity><cbc:LineExtensionAmount>40.00</cbc:LineExtensionAmount>
  <cac:Item><cbc:Name>Aceite 5W30 granel</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>21</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
  <cac:Price><cbc:PriceAmount>8.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`

test('UBL (taller) se lee SIN IA', () => {
  const m = mapearExtraccion(leerFacturaXml(UBL))
  assert.ok(m.ok)
  if (!m.ok) return
  assert.equal(m.borrador.nifEmisor, 'B41234567')
  assert.equal(m.borrador.numero, 'F-2026-118')
  assert.equal(m.borrador.totalCent, 7986)
  assert.deepEqual(m.borrador.lineas.map((l) => [l.clave, l.cantidadMil, l.precioUnitCent, l.ivaPb, l.importeCent]), [['W712/75', 4000, 650, 2100, 2600], [null, 5000, 800, 2100, 4000]])
})

test('XML no reconocible o mal formado → null (se irá al respaldo por IA o a revisión)', () => {
  assert.equal(leerFacturaXml('<Pedido><x>1</x></Pedido>'), null)
  assert.equal(leerFacturaXml('<Invoice><a></Invoice>'), null)
  assert.equal(leerFacturaXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><Invoice/>'), null)
})

test('la cuenta bancaria no viaja a la IA (XML minimizado)', () => {
  const t = xmlMinimizado(FACTURAE)!
  assert.ok(t.includes('TaxIdentificationNumber: ESB29876543'))
  assert.ok(!t.includes('ES9121000418450200051332'))
  assert.ok(!t.includes('Calle Falsa'))
  assert.ok(!t.includes('SignatureValue'))
})
