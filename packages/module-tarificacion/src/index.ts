// @central/module-tarificacion — tarificador RPA de Grupo ASegura (05/10/2026).
// Canal que cotiza en portales de compañía lo que Codeoscopic/Avant2 no cubre. TARIFICAR ≠ EMITIR.
// Lógica pura: la consume apps/asegura (orquestador, cola en Postgres) y services/tarificador-rpa
// (worker Playwright en una máquina efímera de Fly).

export type {
  RamoRpa,
  DireccionRiesgo,
  RiesgoComunidad,
  Fraccionamiento,
  CoberturaOferta,
  FranquiciaOferta,
  PdfRef,
  OfertaNormalizada,
  DesglosePrima,
  ModalidadPortal,
  Credenciales,
  ContextoTarificacion,
  ResultadoAdaptador,
  TarificadorAdapter,
} from './tipos.ts'

export { MODOS_INTEGRACION, esModoIntegracion, puedeAutomatizar, type ModoIntegracion } from './modo-integracion.ts'
export {
  ESTADOS_TRABAJO,
  ESTADOS_TERMINALES,
  TIPOS_ERROR,
  MAX_INTENTOS,
  esEstadoTrabajo,
  esTipoError,
  puedeTransitar,
  estadoTrasError,
  puedeReintentar,
  type EstadoTrabajo,
  type TipoError,
} from './estados.ts'
export { PATRON_EMISION, PATRON_ACEPTAR, TEXTOS_BLOQUEADOS_ALTA, EmisionBloqueadaError, pareceEmision, comprobarUrl, comprobarBoton, type OpcionesGuard } from './guard-emision.ts'
export { MaquinaFases, type FaseTarificacion, type PestanaActiva } from './fases.ts'
export { MARCA_REDACTADO, esVariableSecreta, secretosDelEntorno, redactar, redactarHtml, crearRedactor } from './redactar.ts'
export { variablesProhibidas, ENV_MAQUINA_PERMITIDAS, envDeMaquina, nombresCredencial } from './entorno.ts'
export { importeEs, importePuntoDecimal } from './importes.ts'
export { validarRiesgoComunidad, type ValidacionRiesgo } from './riesgo.ts'
export { validarOfertas, franquiciaGeneral, garantiasComoRegistro, type ValidacionOfertas, type ValorGarantiaCompatible } from './ofertas.ts'
export { claveCompania, crearRegistro, type RegistroAdaptadores } from './registro.ts'
export {
  MARCA_DATO_PERSONAL,
  redactarDatosPersonales,
  limpiarTextoAviso,
  coherenciaPrecio,
  UMBRAL_ACOMPANAMIENTO,
  acompanamientoInicial,
  siguienteAcompanamiento,
  type ValoresLeidos,
  type IncidenciaPrecio,
  type EstadoAcompanamiento,
  type EventoAcompanamiento,
} from './formador.ts'
export {
  CLAVES_SOLO_DE_COMPANIA,
  ALLIANZ_TIPO_VIVIENDA,
  ALLIANZ_USO,
  ALLIANZ_LISTA_PROPIETARIOS,
  CAPACIDAD_ALLIANZ_COMUNIDADES,
  validarFormularioComunidad,
  validarExtras,
  crearCatalogo,
  catalogoCotizacion,
  prepararSolicitud,
  type FormularioComunidad,
  type ValidacionFormulario,
  type CampoExtra,
  type ValorExtra,
  type ExtrasValidos,
  type CapacidadCotizacion,
  type CatalogoCotizacion,
  type SolicitudPreparada,
} from './capacidades.ts'

// Formulario canónico de RC general / de actividad (08/10/2026): ramo sin compañía registrada todavía.
export {
  AMBITOS_TERRITORIALES_RC,
  normalizarCnae,
  validarFormularioRC,
  type AmbitoTerritorialRc,
  type FormularioRC,
  type ValidacionFormularioRC,
} from './formulario-rc.ts'

// Formulario canónico de Comercio / Negocio (08/10/2026): ramo sin compañía registrada todavía.
export {
  REGIMENES_LOCAL,
  validarFormularioComercio,
  type FormularioComercio,
  type RegimenLocal,
  type ValidacionFormularioComercio,
} from './formulario-comercio.ts'

// Fichas de producto y coberturas (07/10/2026): catálogo canónico, validador anti-alucinación y comparador.
export {
  RAMOS_FICHA,
  CATALOGO_FICHAS,
  esRamoFicha,
  garantiasFicha,
  garantiaFicha,
  normalizarLiteral,
  claveDeLiteral,
  type RamoFicha,
  type GrupoGarantiaFicha,
  type TipoValorFicha,
  type GarantiaFicha,
} from './fichas-catalogo.ts'
export {
  textoPlano,
  citaEnTexto,
  paginaDeCita,
  formasImporte,
  importeEnTexto,
  porcentajeEnTexto,
  numeroPositivo,
  validarLimite,
  validarFranquicia,
  validarExtraccion,
  validarValoresPresupuesto,
  fnv1a64,
  citasCondicionado,
  huellaCondicionado,
  comprobarCondicionado,
  validarEdicionGarantia,
  aplicarEdicion,
  condicionesDeJson,
  presupuestoDeJson,
  claveProducto,
  type EstadoCobertura,
  type Limite,
  type Franquicia,
  type Sublimite,
  type CondicionGarantia,
  type ExtraFicha,
  type EstadoFicha,
  type IdentidadProducto,
  type CondicionesProducto,
  type ValorCitado,
  type ValoresPresupuesto,
  type MotivoAviso,
  type AvisoExtraccion,
  type ResultadoValidacion,
  type EdicionGarantia,
} from './fichas.ts'
export {
  compararOfertas,
  fichaDeOferta,
  type FichaComparable,
  type OfertaComparable,
  type CeldaComparador,
  type DiferenciasFila,
  type FilaComparador,
  type ColumnaComparador,
  type TablaComparador,
} from './comparador-fichas.ts'
export {
  MARCA_MARCO,
  FIN_MARCA_MARCO,
  MAX_BYTES_PANTALLA,
  MAX_PANTALLAS,
  PATRON_CAMPO_SENSIBLE,
  PATRON_PARAM_SENSIBLE,
  BLOQUEO_GRABADOR,
  TIPOS_CAMPO_MAPA,
  LIMITES_MAPA,
  normalizarGrabador,
  clasificarBoton,
  redactarUrl,
  esCampoSensible,
  redactarHtmlGrabacion,
  separarMarcosGrabacion,
  recortarHtmlParaIA,
  selectorValido,
  validarPantallaMapa,
  leerMapaGuardado,
  fusionarPantalla,
  extraerJsonIA,
  nombrePantallaValido,
  type ClaseBoton,
  type TipoCampoMapa,
  type CampoMapa,
  type BotonMapa,
  type PrimaMapa,
  type PantallaMapa,
  type MapaGrabacion,
  type PantallaSeparada,
} from './grabador.ts'
export { VERSION_GRABADOR, FUENTE_GRABADOR, configGrabador, AVISO_MARCO_NO_LEGIBLE, codigoBookmarklet, urlBookmarklet, type ConfigGrabador } from './grabador-bookmarklet.ts'
