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
