import { describe, it, expect } from 'vitest'
import { generarSepaXml, validarIban } from './sepa-xml'

// IBAN de ejemplo públicos (checksum válido), no son cuentas reales de nadie.
const DEUDOR = 'ES9121000418450200051332'
const ACREEDOR = 'ES7921000813610123456789'

const BASE = {
  debtorName: 'Empresa Ejemplo SL',
  debtorIban: DEUDOR,
  fechaEjecucion: '2026-11-30',
  idMensaje: 'MSG-001',
  creadoEn: new Date('2026-11-07T10:00:00Z'),
  transferencias: [
    { creditorName: 'Ana Pérez', creditorIban: ACREEDOR, importe: 1234.56, concepto: 'NOMINA 2026-11', endToEndId: 'E2E-1' },
  ],
}

describe('generarSepaXml', () => {
  it('sin propósito: XML de siempre (sin CtgyPurp, Purp ni Id del ordenante)', () => {
    const xml = generarSepaXml(BASE)
    expect(xml).not.toContain('CtgyPurp')
    expect(xml).not.toContain('<Purp>')
    expect(xml).not.toContain('<OrgId>')
    expect(xml).toContain('<CreDtTm>2026-11-07T10:00:00</CreDtTm>')
  })

  it('con SALA: XML de referencia completo (orden de elementos según pain.001.001.03)', () => {
    const xml = generarSepaXml({
      ...BASE,
      proposito: 'SALA',
      iniciadorId: 'B12345678000',
      debtorBic: 'CAIXESBBXXX',
      transferencias: [
        ...BASE.transferencias,
        { creditorName: 'Luis Gómez', creditorIban: 'ES76 2077 0024 0031 0257 5766', importe: 0.1, concepto: 'NOMINA 2026-11', endToEndId: 'E2E-2' },
      ],
    })
    expect(xml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>MSG-001</MsgId>
      <CreDtTm>2026-11-07T10:00:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>1234.66</CtrlSum>
      <InitgPty>
        <Nm>Empresa Ejemplo SL</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>B12345678000</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>MSG-001-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>1234.66</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <CtgyPurp>
          <Cd>SALA</Cd>
        </CtgyPurp>
      </PmtTpInf>
      <ReqdExctnDt>2026-11-30</ReqdExctnDt>
      <Dbtr>
        <Nm>Empresa Ejemplo SL</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>ES9121000418450200051332</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>CAIXESBBXXX</BIC>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>E2E-1</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">1234.56</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>Ana Pérez</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>ES7921000813610123456789</IBAN>
          </Id>
        </CdtrAcct>
        <Purp>
          <Cd>SALA</Cd>
        </Purp>
        <RmtInf>
          <Ustrd>NOMINA 2026-11</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>E2E-2</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">0.10</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>Luis Gómez</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>ES7620770024003102575766</IBAN>
          </Id>
        </CdtrAcct>
        <Purp>
          <Cd>SALA</Cd>
        </Purp>
        <RmtInf>
          <Ustrd>NOMINA 2026-11</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`)
  })

  it('CtrlSum se suma en céntimos enteros (no descuadra con floats)', () => {
    const transferencias = Array.from({ length: 30 }, (_, i) => ({
      creditorName: `E${i}`, creditorIban: ACREEDOR, importe: 0.1, concepto: 'x',
    }))
    const xml = generarSepaXml({ ...BASE, transferencias })
    expect(xml).toContain('<CtrlSum>3.00</CtrlSum>')
  })

  it('rechaza un propósito fuera de la lista y un importe no numérico', () => {
    expect(() => generarSepaXml({ ...BASE, proposito: 'XXXX' as never })).toThrow(/no admitido/)
    expect(() => generarSepaXml({ ...BASE, transferencias: [{ ...BASE.transferencias[0], importe: NaN }] })).toThrow()
  })
})

describe('validarIban', () => {
  it('acepta checksum válido y rechaza uno alterado', () => {
    expect(validarIban(ACREEDOR)).toBe(true)
    expect(validarIban('ES7921000813610123456780')).toBe(false)
    expect(validarIban('')).toBe(false)
  })
})
