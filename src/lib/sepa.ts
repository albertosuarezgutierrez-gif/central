/**
 * ia.rest — Generador SEPA Credit Transfer (pain.001.001.03)
 * Estándar ISO 20022 — compatible con todos los bancos españoles y europeos.
 * El fichero XML se sube al portal del banco (BBVA, Caixabank, Santander…).
 * Sin intermediarios, sin coste por transferencia.
 *
 * Referencias:
 * - EPC125-05 v3.0 SEPA Credit Transfer Scheme Rulebook
 * - ISO 20022 pain.001.001.03
 */

export interface SepaOrdenante {
  nombre: string         // Razón social del restaurante/grupo
  iban: string           // IBAN de la cuenta deudora
  bic?: string           // BIC/SWIFT (opcional en SEPA zona euro)
  nif?: string           // NIF del ordenante
}

export interface SepaPago {
  id: string             // Identificador único del pago (EndToEndId)
  acreedor_nombre: string
  acreedor_iban: string
  acreedor_bic?: string
  importe: number        // En euros, 2 decimales
  concepto: string       // Hasta 140 chars
  fecha_ejecucion: string // YYYY-MM-DD
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .slice(0, 140)
}

function ibanClean(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}

/**
 * Genera el XML SEPA pain.001.001.03 para un lote de pagos.
 * Un solo fichero puede contener N pagos (uno por proveedor).
 */
export function generarSEPA(ordenante: SepaOrdenante, pagos: SepaPago[]): string {
  if (!pagos.length) throw new Error('Sin pagos para exportar')

  const msgId = `IAREST-${Date.now()}`
  const creDtTm = new Date().toISOString().slice(0, 19)
  const nbOfTxs = pagos.length
  const ctrlSum = pagos.reduce((acc, p) => acc + p.importe, 0).toFixed(2)

  // Agrupar por fecha de ejecución (un PmtInf por fecha)
  const byFecha: Record<string, SepaPago[]> = {}
  for (const p of pagos) {
    if (!byFecha[p.fecha_ejecucion]) byFecha[p.fecha_ejecucion] = []
    byFecha[p.fecha_ejecucion].push(p)
  }

  const pmtInfs = Object.entries(byFecha).map(([fecha, lote], idx) => {
    const pmtId = `PMT-${msgId}-${idx + 1}`
    const pmtSum = lote.reduce((acc, p) => acc + p.importe, 0).toFixed(2)
    const txs = lote.map(p => `
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${esc(p.id)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${p.importe.toFixed(2)}</InstdAmt>
        </Amt>
        ${p.acreedor_bic ? `<CdtrAgt><FinInstnId><BIC>${esc(p.acreedor_bic)}</BIC></FinInstnId></CdtrAgt>` : ''}
        <Cdtr>
          <Nm>${esc(p.acreedor_nombre)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id><IBAN>${ibanClean(p.acreedor_iban)}</IBAN></Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${esc(p.concepto)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`).join('')

    return `
    <PmtInf>
      <PmtInfId>${esc(pmtId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${lote.length}</NbOfTxs>
      <CtrlSum>${pmtSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${fecha}</ReqdExctnDt>
      <Dbtr>
        <Nm>${esc(ordenante.nombre)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id><IBAN>${ibanClean(ordenante.iban)}</IBAN></Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          ${ordenante.bic ? `<BIC>${esc(ordenante.bic)}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}
        </FinInstnId>
      </DbtrAgt>
      ${txs}
    </PmtInf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${esc(ordenante.nombre)}</Nm>
      </InitgPty>
    </GrpHdr>
    ${pmtInfs}
  </CstmrCdtTrfInitn>
</Document>`
}

/**
 * Valida un IBAN español/europeo básico (formato, no checksum completo)
 */
export function validarIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/.test(clean)
}

/**
 * Formatea IBAN para mostrar en UI: ES12 3456 7890 1234 5678 9012
 */
export function formatIBAN(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  return clean.match(/.{1,4}/g)?.join(' ') ?? iban
}
