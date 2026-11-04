// España — AEAT VeriFactu (RD 1007/2023, Orden HAC/1177/2024). Lógica PURA y reutilizable por cualquier
// sector: registros de alta/anulación encadenados, huella, QR de cotejo, XML de suministro y el contrato
// del transporte (sin envío ni firma). Dinero en céntimos enteros.
export {
  ErrorVerifactu, centimosAImporte, eurosACentimos, exigirCentimos, formatoTipoImpositivo,
  fechaAeat, fechaHoraHuso, exigirFechaHoraHuso,
} from './importe.ts'
export {
  TIPO_HUELLA_SHA256, cadenaHuellaAlta, cadenaHuellaAnulacion, huellaAlta, huellaAnulacion, esHuellaValida,
} from './huella.ts'
export type { CamposHuellaAlta, CamposHuellaAnulacion } from './huella.ts'
export {
  TIPOS_FACTURA, TIPOS_RECTIFICATIVA, esRectificativa, desglosarDesdeTotales, desglosarDesdeBases,
  totalesDesglose, construirRegistroAlta, construirRegistroAnulacion, eslabonDe, primerEslabonRoto,
} from './registro.ts'
export type {
  TipoFactura, TipoRectificativa, IdFactura, DetalleIva, Destinatario, EslabonAnterior,
  DatosRegistroAlta, RegistroAlta, DatosRegistroAnulacion, RegistroAnulacion, RegistroFacturacion,
} from './registro.ts'
export { urlQrCotejo, LEYENDA_VERIFACTU } from './qr.ts'
export type { DatosQr, EntornoAeat } from './qr.ts'
export {
  xmlRegistroAlta, xmlRegistroAnulacion, xmlSuministroLR,
  NS_SUMINISTRO_LR, NS_SUMINISTRO_INFORMACION, NS_SOAP, ID_VERSION,
} from './xml-suministro.ts'
export type { SistemaInformatico, ObligadoEmision } from './xml-suministro.ts'
export { ENDPOINT_VERIFACTU, transporteDesactivado } from './transporte.ts'
export type { TransporteVerifactu, PeticionEnvio, RespuestaTransporte, ErrorRegistroAeat } from './transporte.ts'
