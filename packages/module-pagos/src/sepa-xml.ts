// Generador de SEPA Credit Transfer pain.001.001.03.
// Fallback sin PIS: genera XML estándar para importación manual al banco (Kutxabank, BBVA…).
// Sin dependencias externas — XML puro, compatible con pain.001.001.03 (ISO 20022).

export interface SepaTransferencia {
  creditorName: string
  creditorIban: string
  importe: number        // en euros, 2 decimales
  concepto: string       // hasta 140 caracteres
  endToEndId?: string    // referencia única interna
}

export interface SepaDocumentoParams {
  debtorName: string
  debtorIban: string
  debtorBic?: string
  fechaEjecucion: string   // YYYY-MM-DD
  idMensaje?: string
  transferencias: SepaTransferencia[]
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function genId(): string {
  const now = new Date()
  return `PLAT${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
}

export function generarSepaXml(params: SepaDocumentoParams): string {
  const msgId = params.idMensaje ?? genId()
  const total = params.transferencias.reduce((s, t) => s + t.importe, 0)
  const totalStr = total.toFixed(2)
  const numTx = params.transferencias.length
  const creationDateTime = new Date().toISOString().slice(0, 19)

  const txBlocks = params.transferencias.map((t, i) => {
    const e2eId = t.endToEndId ?? `${msgId}-${String(i + 1).padStart(3, '0')}`
    const importeStr = t.importe.toFixed(2)
    const concepto = esc(t.concepto.slice(0, 140))
    return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${esc(e2eId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${importeStr}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${esc(t.creditorName.slice(0, 70))}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${esc(t.creditorIban.replace(/\s/g, ''))}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${concepto}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${numTx}</NbOfTxs>
      <CtrlSum>${totalStr}</CtrlSum>
      <InitgPty>
        <Nm>${esc(params.debtorName.slice(0, 70))}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${numTx}</NbOfTxs>
      <CtrlSum>${totalStr}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${params.fechaEjecucion}</ReqdExctnDt>
      <Dbtr>
        <Nm>${esc(params.debtorName.slice(0, 70))}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${esc(params.debtorIban.replace(/\s/g, ''))}</IBAN>
        </Id>
      </DbtrAcct>${params.debtorBic ? `
      <DbtrAgt>
        <FinInstnId>
          <BIC>${esc(params.debtorBic)}</BIC>
        </FinInstnId>
      </DbtrAgt>` : ''}
${txBlocks}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`
}

// Valida un IBAN (formato, checksum ISO 7064).
export function validarIban(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const rearranged = s.slice(4) + s.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let remainder = BigInt(0)
  for (const chunk of numeric.match(/.{1,9}/g) ?? []) {
    remainder = (remainder * BigInt(10 ** chunk.length) + BigInt(chunk)) % BigInt(97)
  }
  return remainder === BigInt(1)
}
