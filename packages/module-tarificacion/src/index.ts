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
export { PATRON_EMISION, TEXTOS_BLOQUEADOS_ALTA, EmisionBloqueadaError, pareceEmision, comprobarUrl, comprobarBoton } from './guard-emision.ts'
export { MARCA_REDACTADO, esVariableSecreta, secretosDelEntorno, redactar, redactarHtml, crearRedactor } from './redactar.ts'
export { variablesProhibidas, ENV_MAQUINA_PERMITIDAS, envDeMaquina, nombresCredencial } from './entorno.ts'
export { importeEs } from './importes.ts'
export { validarRiesgoComunidad, type ValidacionRiesgo } from './riesgo.ts'
export { validarOfertas, franquiciaGeneral, garantiasComoRegistro, type ValidacionOfertas, type ValorGarantiaCompatible } from './ofertas.ts'
export { claveCompania, crearRegistro, type RegistroAdaptadores } from './registro.ts'
