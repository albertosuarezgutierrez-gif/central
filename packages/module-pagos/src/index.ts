// @central/module-pagos — módulo portable de pago a proveedores.
// Lógica pura: tipos, SEPA XML, validación IBAN. Sin BD ni secretos.

export type {
  EstadoFactura,
  OrigenFactura,
  FacturaProveedor,
  PagoParams,
  PagoIniciado,
  EstadoPago,
  DatosFacturaExtraidos,
  ConciliacionResultado,
} from './types'

export {
  generarSepaXml,
  validarIban,
  SEPA_PROPOSITOS,
} from './sepa-xml'

export type {
  SepaTransferencia,
  SepaDocumentoParams,
  SepaProposito,
} from './sepa-xml'
