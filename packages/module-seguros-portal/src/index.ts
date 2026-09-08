export { NIVELES, camposVisibles } from './acceso.ts'
// Qué COSA está asegurada (el coche, el piso). Lee `bien-asegurado.ts` antes de
// tocarlo: `cosa` y `ubicacion` salen separados porque la dirección de un hogar
// es un dato de la PERSONA y no la ve un tercero.
export { describirBien, describirBienConGemela, bienTieneAlgo, BIEN_VACIO } from './bien-asegurado.ts'
export type { BienAsegurado } from './bien-asegurado.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar, debeSustituir } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
export { VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, estadoCodigo } from './codigo.ts'
// ¿Se le puede ENVIAR un código a esto? Cierra el amplificador de correo de
// `/api/acceso/solicitar`. Lee su cabecera antes de tocarlo: VALIDA PERO NO
// NORMALIZA, y esa decisión es la que evita que el hash de escritura y el de
// lectura dejen de coincidir.
export { destinoValido, MAX_DESTINO } from './destino.ts'
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
// Quitar de la bóveda una póliza que aportó el CLIENTE. Lee su cabecera: las de
// la CARTERA no se borran (no hay ruta que las escriba) y un parte de siniestro
// bloquea el borrado, porque la FK es ON DELETE SET NULL y lo dejaría huérfano.
export {
  MENSAJE_PARTE_EN_COMPANIA,
  avisoPartesConservados,
  describirPolizaDesligada,
  fotoDeLaPoliza,
  parteEnCompania,
  puedeBorrarDeclarada,
} from './poliza-borrable.ts'
export type {
  Borrabilidad,
  EstadoParteBorrado,
  FotoPolizaDesligada,
  ParteDePoliza,
  ReparoBorrado,
} from './poliza-borrable.ts'
export {
  TIPOS_DOCUMENTO,
  avisoDocumentoNoPoliza,
  importeEsPrimaAnual,
  normalizarTipoDocumento,
} from './tipo-documento.ts'
export type { TipoDocumento } from './tipo-documento.ts'

export {
  DIAS_PREAVISO_TOMADOR,
  DIAS_VENTANA_AVISO,
  fechaAccionable,
  entraEnVentana,
  polizaGeneraObligacion,
  obligacionDerivable,
  reparoDeclarada,
  declaradaGeneraObligacion,
} from './obligacion.ts'
export type { VigenciaObligacion, ReparoDeclarada } from './obligacion.ts'
export {
  DIAS_LEAD_URGENTE,
  estadoLead,
  leadDeclarada,
  leadUrgente,
  normalizarNumeroPoliza,
  ordenarLeads,
} from './lead-declarada.ts'
export type { EntradaLead, EstadoLead, Lead } from './lead-declarada.ts'
export { cifParaBuscarFicha, etiquetaTitular, fichaParaCotejar, normalizarTitular } from './titular-declarado.ts'
export type { TipoTitular, TitularDeclarado } from './titular-declarado.ts'
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
  MAX_NOMBRE_INVITADO,
  normalizarNombreInvitado,
  relacionInvitacion,
  RELACIONES_INVITACION,
  SIN_COMPARTIR,
  ALCANCES_INVITACION,
  alcanceInvitacion,
  invitacionAbreAcceso,
  TEXTO_INVITACION_SIN_ACCESO,
  TEXTO_INVITACION_SIN_ACCESO_V1,
} from './invitacion.ts'
export type {
  ResultadoInvitacion,
  EstadoInvitacion,
  InvitacionFechas,
  AlcanceInvitacion,
} from './invitacion.ts'

// A quién llama el cliente cuando acaba de pasarle algo. Lee su cabecera antes
// de tocarlo: sus cuatro prohibiciones (no decir «no tiene», no decir «24 h»,
// no pintar un WhatsApp como un teléfono, no cruzar de forma aproximada) son
// las que acaban delante de alguien que acaba de tener un golpe.
export { enlaceWhatsapp, viasDeCompania, canalDeCompania, TEXTO_SIN_CANAL } from './canal-compania.ts'
export type { FilaCompania, ViaCanal, CanalCompania } from './canal-compania.ts'
export { canalesDeLasPolizas } from './canal-compania.ts'
// La acreditación de que se enseñó la información precontractual del mediador
// (art. 19 LDS) al entrar. Su cabecera explica por qué `avisos` y `comercial`
// existen en la BD pero NO se escriben: no hay pantalla que los pida.
export {
  TIPOS_CONSENTIMIENTO,
  TIPOS_QUE_SE_REGISTRAN,
  USER_AGENT_MAX,
  necesitaRegistro,
  normalizarIp,
  normalizarUserAgent,
} from './consentimiento.ts'
export type { TipoConsentimiento, ConsentimientoGuardado } from './consentimiento.ts'

// La solicitud de SUPRESIÓN (art. 17). Lee su cabecera antes de tocarla: este
// módulo NO borra nada, y esa es la mitad del diseño — el art. 17.3.b y el
// 17.3.e excluyen la supresión cuando hay deber legal de conservar o hace falta
// para defender reclamaciones, y una correduría tiene los dos.
export {
  ESTADOS_SUPRESION,
  DIAS_RESPUESTA,
  DIAS_PRORROGA,
  DIAS_AVISO,
  ALCANCE_SUPRESION,
  YA_PENDIENTE,
  fechaLimite,
  estadoPlazo,
  diasRestantes,
  loQueSeSuprime,
  loQueSeConserva,
  puedeRegistrar,
} from './supresion.ts'
export type { EstadoSupresion, EstadoPlazo, SolicitudSupresion, Alcance as AlcanceSupresion } from './supresion.ts'
export {
  VISTAS_BOVEDA,
  VISTA_BOVEDA_POR_DEFECTO,
  vistaDeBoveda,
  pestanasPortal,
  hrefDeVista,
} from './vista-portal.ts'
export type { VistaBoveda, PestanaPortal } from './vista-portal.ts'
export {
  ESTADOS_SINIESTRO,
  siniestroAbierto,
  etiquetaEstadoSiniestro,
  tonoEstadoSiniestro,
  ordenarHistorialSiniestros,
  resumirHistorialSiniestros,
  lugarSiniestro,
  descripcionSiniestro,
} from './siniestro-historial.ts'
export type { EstadoSiniestro, SiniestroHistorial } from './siniestro-historial.ts'
export {
  SITUACIONES_RECIBO,
  reciboAnulado,
  reciboAlCobro,
  etiquetaSituacionRecibo,
  tonoSituacionRecibo,
  fechaReciboFiable,
  ordenarRecibos,
  estadoRecibos,
  resumirRecibos,
} from './recibo-historial.ts'
export type { SituacionRecibo, ReciboHistorial, ResumenRecibos } from './recibo-historial.ts'
export {
  BYTES_TOKEN_HOJA,
  MAX_HOJAS_VIVAS,
  MAX_NOMBRE_HOJA,
  normalizarTokenHoja,
  normalizarNombreHoja,
  estadoHoja,
  seleccionHoja,
  polizasDeLaHoja,
  loQueVeQuienEscanea,
} from './hoja-qr.ts'
export type { EstadoHoja, SeleccionHoja, ErrorSeleccion } from './hoja-qr.ts'
// En qué cajón va cada titular de la bóveda (mías / de mis empresas / de quien
// me autoriza). Se agrupa por `clienteId`, nunca por nombre: dos fichas con el
// mismo nombre son dos titulares, y fundirlas mezcla sus pólizas en silencio.
export { GRUPOS_CARTERA, TITULO_GRUPO, agruparCartera, grupoDeTitular } from './agrupar-cartera.ts'
export type { GrupoCartera, TitularAgrupable, BloqueCartera } from './agrupar-cartera.ts'

export { TRAMOS, saludoPorHora, nombreDePila } from './saludo.ts'
export type { Tramo } from './saludo.ts'

export { resumirCartera } from './resumen-cartera.ts'
export type { PolizaResumible, ResumenCartera } from './resumen-cartera.ts'
export { elegirFicha, prediccionDeVinculo } from './vinculo-elegir.ts'
export type { Candidato, FichaElegida, PrediccionVinculo } from './vinculo-elegir.ts'
// El cliente corrige SU dirección de CONTACTO desde el portal (08/09/2026). Lee
// su cabecera antes de tocarlo: la decisión que importa es que con varias fichas
// vinculadas NO se elige una, y que esto no le cambia nada a ninguna compañía.
export {
  decidirFichaPropia,
  textoHistorialContactoPropio,
  CAMPOS_CONTACTO_PROPIO,
  CAMPOS_VETADOS_AL_CLIENTE,
} from './contacto-propio.ts'
export type { FichaPropia, CampoContactoPropio } from './contacto-propio.ts'
// El botón de sugerencias del portal (08/09/2026). Lee su cabecera: aquí
// Telegram NO es un aviso, es el ÚNICO registro — y por eso «enviada» es lo
// único que promete algo, y el texto de la persona se ESCAPA antes de componer.
export {
  MAX_SUGERENCIA,
  MIN_SUGERENCIA,
  escaparHtml,
  normalizarSugerencia,
  mensajeSugerencia,
  resultadoSugerencia,
} from './sugerencia.ts'
export type { ContextoSugerencia, ResultadoSugerencia } from './sugerencia.ts'
