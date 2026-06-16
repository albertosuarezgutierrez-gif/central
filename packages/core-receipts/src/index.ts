// Punto de entrada de @central/core-receipts.
export const CORE_RECEIPTS_VERSION = '0.0.0'

export type {
  Lang,
  ReceiptKind,
  FiscalFields,
  ReceiptLine,
  Branding,
  ReceiptDoc,
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
  generarEscPosCuenta,
} from './renderers/thermal.ts'
export type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from './renderers/thermal.ts'
