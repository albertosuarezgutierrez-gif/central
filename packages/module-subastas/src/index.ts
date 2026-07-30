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
  esEmpresaInmobiliaria,
} from './parsing.ts'

// Alertas del Portal de Subastas del BOE recibidas por correo (fuente principal)
export { parsearAlertaBoe, parsearEstado, decodificarHtml, esAlertaBoe } from './email-boe.ts'
export type { ResultadoAlertaBoe } from './email-boe.ts'

// Patrimonio de la Junta de Andalucía: subastas abiertas + adquisición directa
export { parsearPatrimonioJunta, loteASubasta, municipioDeLote, fechaTextualEs } from './junta.ts'
export type { LoteJunta } from './junta.ts'

// Documentos adjuntos a la ficha del BOE: edictos con texto → señales explícitas
export { enlacesDocumentos, datosDeEdicto, notasDeEdicto } from './edicto.ts'
export type { DocumentoFicha, DatosEdicto } from './edicto.ts'

// Extracción de datos desde la descripción registral (tipo, superficie,
// dirección, finca, dormitorios…) — la materia prima para filtrar de verdad
export { extraerDatos, tipoBien, direccion, fincaRegistral, registroPropiedad, dormitorios, banos, planta, cuotaParticipacion } from './extraccion.ts'
export type { DatosDescripcion, TipoBien } from './extraccion.ts'
export { superficieM2, palabrasANumero, numeroAlFinal } from './numeros-es.ts'

// Municipio → provincia (las descripciones del BOE citan municipios, no provincias)
// + enlace a Google Maps con la mejor ubicación disponible
export { provinciaPorMunicipio, MUNICIPIOS_POR_PROVINCIA, urlGoogleMaps } from './geo.ts'
export type { UbicacionSubasta } from './geo.ts'

// Ficha del Portal de Subastas (las CIFRAS) y Catastro (superficie, año, uso)
export { parsearFichaBoe, paresFicha, resultadoDeFicha } from './ficha-boe.ts'
export type { FichaBoe, ResultadoSubasta } from './ficha-boe.ts'
export { parsearCatastro, errorCatastro, superficieUtil, parsearCoordenadas } from './catastro.ts'
export type { DatosCatastro, CoordenadasCatastro } from './catastro.ts'

// Comparables de mercado desde las alertas de los portales (Idealista): el
// €/m² por zona que sirve de valor de mercado cuando el BOE publica «Tasación 0,00 €»
export { parsearAlertaIdealista, esAlertaIdealista, precioM2Zona, velocidadZona, DIAS_DESAPARICION } from './comparables.ts'
export type { Comparable } from './comparables.ts'
// Chollos de venta directa: el mismo corpus de anuncios, mirado al revés —
// ¿qué anuncio está muy por debajo de la mediana €/m² de su zona?
export { detectarChollos, zonasDeComparable, estimarAntiguedad, CHOLLO_DESCUENTO_MIN, CHOLLO_DESCUENTO_SOSPECHOSO } from './comparables.ts'
export type { Chollo, ObservacionRef, VelocidadZona, ZonaPortalRef } from './comparables.ts'
// Calibración con RESULTADOS reales: a qué % del tipo se adjudica de verdad
export { calibracionAdjudicaciones, MIN_MUESTRA_CALIBRACION } from './adjudicaciones.ts'
export type { ResultadoConcluido, CalibracionZona } from './adjudicaciones.ts'
// Fotocasa: mismas zonas, más particulares — segunda fuente de comparables
export { parsearAlertaFotocasa, esAlertaFotocasa, datosFichaFotocasa, PORTAL_FOTOCASA } from './fotocasa.ts'
export type { FichaFotocasa } from './fotocasa.ts'
export { slugZonaFotocasa, slugDistritoFotocasa, slugNucleoPlaya, MIN_MUESTRA_ZONA } from './zona.ts'
export type { ZonaPortal } from './zona.ts'

// Lente flip (comprar-reformar-vender), radar playa y análisis documental
export { evaluarFlip, reformaEstimada, REFORMA_EUR_M2, PCT_COSTES_VENTA, FLIP_MARGEN_MIN } from './flip.ts'
export type { Flip } from './flip.ts'
export { esPlayaHuelva, MUNICIPIOS_PLAYA_HUELVA, NUCLEOS_PLAYA_HUELVA, TOPE_PLAYA } from './playa.ts'
export { analisisDocumental } from './analisis.ts'
export type { AnalisisDocumental, PuntoAnalisis, Nivel } from './analisis.ts'

// Coste "puerta abierta"
export { calcularCoste, deposito, pujaMaximaParaDescuento, yieldTuristico, PARAMS_ANDALUCIA, PCT_DEPOSITO, LANZAMIENTO_ESTIMADO } from './costes.ts'
export type { YieldTuristico } from './costes.ts'

// Tesorería del depósito: cuánto dinero hay que tener bloqueado A LA VEZ
export { planTesoreria, DIAS_RETENCION_DEPOSITO } from './tesoreria.ts'
export type { CompromisoDeposito, TramoTesoreria, PlanTesoreria } from './tesoreria.ts'

// Scoring de oportunidad
export { evaluarOportunidad, FACTORES } from './scoring.ts'

// Radar por criterios
export { coincideSubasta, filtrarSubastas, claveInmueble } from './radar.ts'
