export {
  POLIZA_ESTADOS_VIGENTES,
  esEstadoVigente,
  vigenciaPoliza,
  explicarVigenciaPendiente,
  type Vigencia,
  type EstadoPolizaVigente,
} from './vigencia.ts'

export {
  DIAS_PREAVISO_TOMADOR,
  DIAS_PREAVISO_ASEGURADOR,
  DIAS_HORIZONTE_RENOVACION,
  diasHastaVencimiento,
  fechaLimiteOposicion,
  fechaLimiteComunicacionAseguradora,
  comunicacionEnPlazo,
  urgenciaRenovacion,
  etiquetaUrgencia,
  primaReferencia,
  primaEnRiesgo,
  type UrgenciaRenovacion,
} from './vencimientos.ts'

export {
  objetoAsegurado,
  pareceMatricula,
  type ObjetoAsegurado,
  type EstadoObjeto,
  type EntradaObjeto,
} from './objeto.ts'

export {
  saludIngesta,
  detalleSalud,
  DIAS_CUARENTENA_RECIENTE,
  type EstadoIngesta,
  type SaludIngesta,
  type EntradaSalud,
  type FicheroEnCuarentena,
} from './ingesta.ts'
export {
  MARCADORES_SIN_DATO,
  CAMPOS_PERSONALES,
  autoLeidoVacio,
  normalizarAutoLeido,
  seLeyoAlgo as seLeyoAlgoAuto,
  camposLeidos,
} from './documento-auto.ts'
export type { AutoLeido } from './documento-auto.ts'

export { importeEiac, sumarImportesEiac } from './importe-eiac.ts'
export {
  interpretarCapital,
  extraerDetalleCobertura,
  type CapitalCobertura,
  type DetalleCobertura,
  type LimiteCobertura,
  type FranquiciaCobertura,
  type PrimaCobertura,
} from './cobertura-detalle.ts'
export {
  resumirRecibos,
  estadoCobro,
  explicarCobro,
  type ReciboCrudo,
  type ReciboResumen,
  type RecibosPoliza,
  type EstadoCobro,
} from './recibos.ts'
export {
  MINIMO_TEXTO,
  planBusqueda,
  avisoDireccion,
  explicarVacio,
  normalizarDireccion,
  direccionCoincide,
  type Criterio,
  type TipoCriterio,
  type PlanBusqueda,
  type Aviso,
  type Cobertura,
} from './busqueda.ts'
export {
  DIAS_SUSPENSION,
  DIAS_EXTINCION,
  retencion,
  resumirRetencion,
  type EstadoRetencion,
  type Retencion,
  type ResumenRetencion,
} from './retencion.ts'
export {
  MESES_CARTERA_VIVA,
  vitalidadFicha,
  etiquetaVitalidad,
  explicarVitalidad,
  avisoHermanas,
  type Vitalidad,
  type SenalesFicha,
  type Hermana,
  type AvisoHermanas,
} from './vitalidad.ts'
export {
  etiquetaRol,
  contactoEfectivo,
  type IntervinienteFicha,
  type ContactoEfectivo,
} from './intervinientes.ts'
export {
  FRACCIONES,
  etiquetaFraccionamiento,
  etiquetaFormaPago,
  recargoFraccionamiento,
  ventanaAnulacion,
  type ReciboCiclo,
  type RecargoFraccionamiento,
} from './pago.ts'
export {
  TIPOS_DOCUMENTO,
  MIMES_DOCUMENTO,
  MAX_BYTES_DOCUMENTO,
  NECESARIOS_EMISION_AUTO,
  etiquetaTipoDocumento,
  etiquetaEstadoDocumento,
  tipoDocumento,
  estadoDocumento,
  revisarDocumento,
  resumenDocumentos,
  documentosQueFaltan,
  type TipoDocumento,
  type EstadoDocumento,
  type DocumentoResumen,
  type ResumenDocumentos,
} from './documentos.ts'
export {
  retarificabilidad,
  RIESGO_HOGAR_MINIMO,
  numeroPositivo,
  anioPlausible,
  cpValido,
  type Retarificabilidad,
  type RamoRetarificable,
  type EntradaRetarificable,
} from './retarificable.ts'
export {
  ETIQUETAS_TELEFONO,
  ETIQUETAS_EMAIL,
  CAMPOS_IDENTIDAD,
  CAMPOS_LIBRES,
  ETIQUETA_CAMPO,
  MOTIVO_DOCUMENTO_REQUERIDO,
  etiquetaContacto,
  normalizarTelefono,
  normalizarEmail,
  normalizarContacto,
  normalizarDni,
  enmascararDni,
  normalizarFechaNacimiento,
  normalizarNombre,
  normalizarCp,
  provinciaPorCp,
  revisarEdicion,
  documentoAcredita,
  documentosAcreditativos,
  textoHistorialEdicion,
  revisarAlta,
  coincidenciaBloquea,
  type Revisado,
  type TipoContacto,
  type ContactoCliente,
  type TipoPersona,
  type CampoIdentidad,
  type CampoLibre,
  type EdicionCliente,
  type IdentidadRevisada,
  type EdicionRevisada,
  type AltaCliente,
  type AltaRevisada,
  type Coincidencia,
} from './cliente-edicion.ts'
