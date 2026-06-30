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
} from './sepa-xml'

export type {
  SepaTransferencia,
  SepaDocumentoParams,
} from './sepa-xml'
