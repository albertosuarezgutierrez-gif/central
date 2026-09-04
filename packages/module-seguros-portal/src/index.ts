export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar, debeSustituir } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
export { VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, estadoCodigo } from './codigo.ts'
export type { EstadoCodigo, CodigoGuardado } from './codigo.ts'
export {
  RAMOS_POLIZA,
  ETIQUETA_RAMO,
  etiquetaRamo,
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
export {
  MAX_TEXTO_RAMO,
  CAMPOS_POR_RAMO,
  RAMOS_CON_CATALOGO,
  camposDeRamo,
  normalizarDatosRamo,
} from './campos-ramo.ts'
export type { TipoCampo, OpcionCampo, CampoRamo, DatosRamo, ResultadoDatosRamo } from './campos-ramo.ts'
export {
  ORIGENES_CAMPO,
  MAX_DIRECCION,
  MAX_VARIANTES,
  esOrigenCampo,
  normalizarOrigenes,
  normalizarReferencia,
  formatoReferencia,
  variantesDireccion,
} from './direccion-catastro.ts'
export type { OrigenCampo, OrigenPorCampo, FormatoReferencia } from './direccion-catastro.ts'

// La petición de acceso: la dirección CONTRARIA a la autorización. Su
// `respuestaPublica()` es lo que impide que el portal sirva de oráculo para
// averiguar quién es cliente de la correduría — lee su cabecera antes de tocar
// nada de esto.
export {
  RESULTADOS_PETICION,
  RESPUESTAS_PUBLICAS,
  respuestaPublica,
  TEXTO_REGISTRADA,
  MAX_PETICIONES_DIA,
  ESTADOS_PETICION,
  DIAS_VIGENCIA_PETICION,
  caducidadPeticion,
  estadoPeticion,
  peticionResoluble,
  MAX_MENSAJE_PETICION,
  normalizarMensajePeticion,
} from './peticion-acceso.ts'
export type {
  ResultadoPeticion,
  RespuestaPublica,
  EstadoPeticion,
  PeticionFechas,
} from './peticion-acceso.ts'
