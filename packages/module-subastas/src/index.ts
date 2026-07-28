// Módulo de subastas de inmuebles (casa de marcas) — entry point único.
// Lógica PURA: normalización, coste real de adquisición, scoring y radar.
// Los adaptadores de fuente (red) y la persistencia viven en la app.

export type {
  Fuente,
  TipoSubasta,
  SituacionPosesoria,
  Ejecutado,
  SubastaInmueble,
  CosteAdquisicion,
  ParamsCoste,
  Oportunidad,
  CriteriosSubasta,
  CoincidenciaSubasta,
} from './types.ts'

// Parseo puro de los textos del anuncio
export {
  norm,
  parseImporteEs,
  parseFechaEs,
  extraerIdSubasta,
  extraerIdBoe,
  extraerRefCatastral,
  clasificarTipo,
  esInmueble,
  situacionPosesoriaDe,
  ejecutadoDe,
  sinVisitaDe,
  porcentajeSubastadoDe,
  cargasConocidasDe,
} from './parsing.ts'

// Alertas del Portal de Subastas del BOE recibidas por correo (fuente principal)
export { parsearAlertaBoe, parsearEstado, decodificarHtml, esAlertaBoe } from './email-boe.ts'
export type { ResultadoAlertaBoe } from './email-boe.ts'

// Extracción de datos desde la descripción registral (tipo, superficie,
// dirección, finca, dormitorios…) — la materia prima para filtrar de verdad
export { extraerDatos, tipoBien, direccion, fincaRegistral, registroPropiedad, dormitorios, banos, planta, cuotaParticipacion } from './extraccion.ts'
export type { DatosDescripcion, TipoBien } from './extraccion.ts'
export { superficieM2, palabrasANumero, numeroAlFinal } from './numeros-es.ts'

// Municipio → provincia (las descripciones del BOE citan municipios, no provincias)
export { provinciaPorMunicipio, MUNICIPIOS_POR_PROVINCIA } from './geo.ts'

// Ficha del Portal de Subastas (las CIFRAS) y Catastro (superficie, año, uso)
export { parsearFichaBoe, paresFicha } from './ficha-boe.ts'
export type { FichaBoe } from './ficha-boe.ts'
export { parsearCatastro, errorCatastro } from './catastro.ts'
export type { DatosCatastro } from './catastro.ts'

// Comparables de mercado desde las alertas de los portales (Idealista): el
// €/m² por zona que sirve de valor de mercado cuando el BOE publica «Tasación 0,00 €»
export { parsearAlertaIdealista, esAlertaIdealista, precioM2Zona } from './comparables.ts'
export type { Comparable } from './comparables.ts'

// Coste "puerta abierta"
export { calcularCoste, deposito, PARAMS_ANDALUCIA, PCT_DEPOSITO, LANZAMIENTO_ESTIMADO } from './costes.ts'

// Tesorería del depósito: cuánto dinero hay que tener bloqueado A LA VEZ
export { planTesoreria, DIAS_RETENCION_DEPOSITO } from './tesoreria.ts'
export type { CompromisoDeposito, TramoTesoreria, PlanTesoreria } from './tesoreria.ts'

// Scoring de oportunidad
export { evaluarOportunidad, FACTORES } from './scoring.ts'

// Radar por criterios
export { coincideSubasta, filtrarSubastas, claveInmueble } from './radar.ts'
