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

/**
 * Códigos ExternalCategoryPurpose1Code / ExternalPurpose1Code admitidos. `SALA` = nómina (salary payment): el banco la
 * trata como pago de salarios (prioridad de abono, confidencialidad del concepto). `SUPP` = pago a proveedor.
 * Sin indicar (por defecto) el XML sale idéntico al de siempre: no hay `CtgyPurp` ni `Purp`.
 */
export type SepaProposito = 'SALA' | 'SUPP'
export const SEPA_PROPOSITOS: readonly SepaProposito[] = ['SALA', 'SUPP']

export interface SepaDocumentoParams {
  debtorName: string
  debtorIban: string
  debtorBic?: string
  fechaEjecucion: string   // YYYY-MM-DD
  idMensaje?: string
  transferencias: SepaTransferencia[]
  /** Categoría del lote (PmtInf/PmtTpInf/CtgyPurp) y propósito de cada transferencia (CdtTrfTxInf/Purp). */
  proposito?: SepaProposito
  /** Identificador del ordenante (InitgPty/Id/OrgId/Othr/Id): en España, NIF + sufijo AEB (p. ej. `B12345678000`). */
  iniciadorId?: string
  /** Fecha/hora de creación (CreDtTm). Inyectable para tests; por defecto, ahora. */
  creadoEn?: Date
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

// Importe en euros → céntimos enteros. La suma de control (CtrlSum) se hace en enteros: sumar floats en euros puede
// descuadrar el céntimo en remesas largas y el banco rechaza el fichero entero si CtrlSum ≠ Σ InstdAmt.
function aCentimos(importe: number): number {
  if (!Number.isFinite(importe)) throw new Error('Importe SEPA no numérico')
  return Math.round(importe * 100)
}

function fmtCentimos(c: number): string {
  const neg = c < 0
  const a = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

export function generarSepaXml(params: SepaDocumentoParams): string {
  const msgId = params.idMensaje ?? genId()
  if (params.proposito !== undefined && !SEPA_PROPOSITOS.includes(params.proposito)) {
    throw new Error(`Propósito SEPA no admitido: ${String(params.proposito)}`)
  }
  const centimos = params.transferencias.map(t => aCentimos(t.importe))
  const totalStr = fmtCentimos(centimos.reduce((s, c) => s + c, 0))
  const numTx = params.transferencias.length
  const creationDateTime = (params.creadoEn ?? new Date()).toISOString().slice(0, 19)
  const proposito = params.proposito

  const txBlocks = params.transferencias.map((t, i) => {
    const e2eId = t.endToEndId ?? `${msgId}-${String(i + 1).padStart(3, '0')}`
    const importeStr = fmtCentimos(centimos[i])
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
        </CdtrAcct>${proposito ? `
        <Purp>
          <Cd>${proposito}</Cd>
        </Purp>` : ''}
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
        <Nm>${esc(params.debtorName.slice(0, 70))}</Nm>${params.iniciadorId ? `
        <Id>
          <OrgId>
            <Othr>
              <Id>${esc(params.iniciadorId.slice(0, 35))}</Id>
            </Othr>
          </OrgId>
        </Id>` : ''}
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
        </SvcLvl>${proposito ? `
        <CtgyPurp>
          <Cd>${proposito}</Cd>
        </CtgyPurp>` : ''}
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
