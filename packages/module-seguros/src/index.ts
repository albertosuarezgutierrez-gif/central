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
