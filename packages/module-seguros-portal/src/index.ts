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

// La invitación por correo: la TERCERA puerta de la autorización, la que trae
// gente que no está en la cartera. Lee su cabecera antes de tocar el token: no
// abre sesión a propósito, y esa decisión tiene tres razones medidas.
export {
  RESULTADOS_INVITACION,
  invitacionRevelaSiEsCliente,
  invitacionEscrita,
  ESTADOS_INVITACION,
  DIAS_VIGENCIA_INVITACION,
  MAX_INVITACIONES_DIA,
  MAX_MENSAJE_INVITACION,
  caducidadInvitacion,
  estadoInvitacion,
  invitacionResoluble,
  BYTES_TOKEN_INVITACION,
  normalizarTokenInvitacion,
  CAMPOS_PROHIBIDOS_EN_INVITACION,
  normalizarMensajeInvitacion,
} from './invitacion.ts'
export type { ResultadoInvitacion, EstadoInvitacion, InvitacionFechas } from './invitacion.ts'

// A quién llama el cliente cuando acaba de pasarle algo. Lee su cabecera antes
// de tocarlo: sus cuatro prohibiciones (no decir «no tiene», no decir «24 h»,
// no pintar un WhatsApp como un teléfono, no cruzar de forma aproximada) son
// las que acaban delante de alguien que acaba de tener un golpe.
export { enlaceWhatsapp, viasDeCompania, canalDeCompania, TEXTO_SIN_CANAL } from './canal-compania.ts'
export type { FilaCompania, ViaCanal, CanalCompania } from './canal-compania.ts'
export { canalesDeLasPolizas } from './canal-compania.ts'
