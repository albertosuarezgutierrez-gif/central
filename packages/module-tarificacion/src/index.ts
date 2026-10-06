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
