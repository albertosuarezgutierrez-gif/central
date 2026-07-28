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

// Municipio → provincia (las descripciones del BOE citan municipios, no provincias)
export { provinciaPorMunicipio, MUNICIPIOS_POR_PROVINCIA } from './geo.ts'

// Coste "puerta abierta"
export { calcularCoste, deposito, PARAMS_ANDALUCIA, PCT_DEPOSITO, LANZAMIENTO_ESTIMADO } from './costes.ts'

// Scoring de oportunidad
export { evaluarOportunidad, FACTORES } from './scoring.ts'

// Radar por criterios
export { coincideSubasta, filtrarSubastas, claveInmueble } from './radar.ts'
