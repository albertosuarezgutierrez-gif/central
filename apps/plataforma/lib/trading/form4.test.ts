import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseForm4Xml, extraerEntradasAtom, elegirDocForm4 } from './form4.ts'

const FORM4 = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>ACME Inc.</issuerName>
    <issuerTradingSymbol>ACME</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>COOK JANE</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <officerTitle>Chief Executive Officer</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>150.25</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionAmounts>
        <transactionShares><value>200</value></transactionShares>
        <transactionPricePerShare><value>151.00</value></transactionPricePerShare>
      </transactionAmounts>
      <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`

test('parseForm4Xml extrae ticker, insider, cargo y SOLO las transacciones P/S', () => {
  const r = parseForm4Xml(FORM4)
  assert.equal(r.length, 1)               // la M (ejercicio de opciones) se descarta
  assert.equal(r[0].simbolo, 'ACME')
  assert.equal(r[0].insider, 'COOK JANE')
  assert.equal(r[0].rol, 'Chief Executive Officer')
  assert.equal(r[0].tipo, 'compra')       // P
  assert.equal(r[0].acciones, 1000)
  assert.equal(r[0].precioUsd, 150.25)
})

test('parseForm4Xml mapea S → venta', () => {
  const xml = FORM4.replace('<transactionCode>P</transactionCode>', '<transactionCode>S</transactionCode>')
  const r = parseForm4Xml(xml)
  assert.equal(r[0].tipo, 'venta')
})

test('parseForm4Xml sin ticker → []', () => {
  assert.deepEqual(parseForm4Xml('<ownershipDocument><issuer><issuerName>x</issuerName></issuer></ownershipDocument>'), [])
})

test('parseForm4Xml deriva el rol de isDirector cuando no hay officerTitle', () => {
  const xml = `<ownershipDocument><issuer><issuerTradingSymbol>FOO</issuerTradingSymbol></issuer>
    <reportingOwner><reportingOwnerId><rptOwnerName>DOE JOHN</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction>
      <transactionAmounts><transactionShares><value>5</value></transactionShares></transactionAmounts>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
    </nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`
  const r = parseForm4Xml(xml)
  assert.equal(r[0].rol, 'Director')
  assert.equal(r[0].precioUsd, undefined)   // sin precio
})

test('extraerEntradasAtom saca {cik, accesion} sin guiones y sin duplicar', () => {
  const atom = `<feed>
    <entry><link href="https://www.sec.gov/Archives/edgar/data/320193/0000320193-24-000001-index.htm"/></entry>
    <entry><link href="https://www.sec.gov/Archives/edgar/data/320193/0000320193-24-000001-index.htm"/></entry>
    <entry><link href="https://www.sec.gov/Archives/edgar/data/789019/0000789019-24-000042-index.htm"/></entry>
  </feed>`
  const r = extraerEntradasAtom(atom)
  assert.equal(r.length, 2)               // dedup
  assert.deepEqual(r[0], { cik: '320193', accesion: '000032019324000001' })
  assert.deepEqual(r[1], { cik: '789019', accesion: '000078901924000042' })
})

test('elegirDocForm4 elige el XML primario y descarta R*.xml/MetaLinks', () => {
  const idx = { directory: { item: [
    { name: 'MetaLinks.xml' }, { name: 'R1.xml' }, { name: 'wf-form4_1700000.xml' }, { name: 'primary_doc.xml' },
  ] } }
  assert.equal(elegirDocForm4(idx), 'wf-form4_1700000.xml')
  assert.equal(elegirDocForm4({ directory: { item: [{ name: 'R2.xml' }] } }), null)
})
