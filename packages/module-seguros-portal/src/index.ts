export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar, debeSustituir } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
export { VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, estadoCodigo } from './codigo.ts'
export type { EstadoCodigo, CodigoGuardado } from './codigo.ts'
export {
  RAMOS_POLIZA,
  polizaLeidaVacia,
  normalizarPolizaLeida,
  seLeyoAlgo,
} from './poliza-leida.ts'
export type { RamoPoliza, PolizaLeida } from './poliza-leida.ts'
export {
  DIAS_PREAVISO_TOMADOR,
  DIAS_VENTANA_AVISO,
  fechaAccionable,
  entraEnVentana,
  polizaGeneraObligacion,
  obligacionDerivable,
} from './obligacion.ts'
export type { VigenciaObligacion } from './obligacion.ts'
export {
  PARTE_ESTADOS,
  DIAS_COMUNICACION_LCS,
  DESCRIPCION_MIN,
  DESCRIPCION_MAX,
  LUGAR_MAX,
  ANIOS_MAXIMOS_ATRAS,
  comunicadoACompania,
  parsearFechaHecho,
  plazoComunicacion,
  normalizarParte,
} from './parte-siniestro.ts'
export type {
  ParteEstado,
  ParteEntrada,
  ParteNormalizado,
  ResultadoParte,
  PlazoComunicacion,
} from './parte-siniestro.ts'
export {
  ALCANCES,
  ALCANCES_CONCEDIBLES,
  TITULOS_REPRESENTACION,
  alcancesConcedibles,
  tituloRepresentacion,
  DIAS_VIGENCIA,
  ESTADOS_AUTORIZACION,
  alcanceConcedible,
  autorizacionVigente,
  caducidadPorDefecto,
  camposDeAlcance,
  camposDeAlcances,
  esAlcance,
  estadoAutorizacion,
  etiquetaNivelAlcances,
  puedeAutorizar,
} from './autorizacion.ts'
export type {
  Alcance,
  AutorizacionFechas,
  EstadoAutorizacion,
  TipoOtorgante,
  TituloRepresentacion,
} from './autorizacion.ts'
