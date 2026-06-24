// Punto de entrada de @central/core-receipts.
export const CORE_RECEIPTS_VERSION = '0.0.0'

export type {
  Lang,
  ReceiptKind,
  FiscalFields,
  ReceiptLine,
  Branding,
  ReceiptDoc,
  Presentacion,
  GlosaContext,
  GlosaProvider,
} from './types.ts'

export {
  assertFiscalIntegrity,
  formatFiscalNumber,
  FiscalIntegrityError,
} from './integrity.ts'

export {
  generarEscPos,
  generarTextoPlano,
  generarTicketCuenta,
} from './renderers/thermal.ts'
export type { PrintPayload, ItemCuenta, TicketCuentaParams } from './renderers/thermal.ts'

export { renderInvoiceHtml, escHtml, eur as eurHtml, fdate as fdateHtml } from './renderers/html.ts'
