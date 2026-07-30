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
// + enlaces externos con la mejor ubicación disponible (mapa, calle, Catastro)
export {
  provinciaPorMunicipio,
  provinciaCanonica,
  MUNICIPIOS_POR_PROVINCIA,
  urlGoogleMaps,
  urlStreetView,
  urlFichaCatastro,
} from './geo.ts'
export type { UbicacionSubasta } from './geo.ts'

// Ficha del Portal de Subastas (las CIFRAS) y Catastro (superficie, año, uso)
export { parsearFichaBoe, paresFicha, resultadoDeFicha } from './ficha-boe.ts'
export type { FichaBoe, ResultadoSubasta } from './ficha-boe.ts'
export {
  parsearCatastro, errorCatastro, superficieUtil, parsearCoordenadas,
  refParcela, direccionCatastro, parsearInmueblesDnploc, parcelaUnica, paramsDnploc,
  parsearVias, nombreViaBuscable, elegirVia,
} from './catastro.ts'
export type { DatosCatastro, CoordenadasCatastro, DireccionCatastro, InmuebleCatastro, ParamsDnploc } from './catastro.ts'

// Comparables de mercado desde las alertas de los portales (Idealista): el
// €/m² por zona que sirve de valor de mercado cuando el BOE publica «Tasación 0,00 €»
export { parsearAlertaIdealista, esAlertaIdealista, precioM2Zona, velocidadZona, DIAS_DESAPARICION } from './comparables.ts'
export type { Comparable } from './comparables.ts'
// Chollos de venta directa: el mismo corpus de anuncios, mirado al revés —
// ¿qué anuncio está muy por debajo de la mediana €/m² de su zona?
export { detectarChollos, zonasDeComparable, estimarAntiguedad, CHOLLO_DESCUENTO_MIN, CHOLLO_DESCUENTO_SOSPECHOSO } from './comparables.ts'
export type { Chollo, ObservacionRef, VelocidadZona, ZonaPortalRef } from './comparables.ts'
// Calibración con RESULTADOS reales: a qué % del tipo se adjudica de verdad
export { calibracionAdjudicaciones, calibracionPorCargas, calibracionPuja, MIN_MUESTRA_CALIBRACION, MIN_MUESTRA_PUJA } from './adjudicaciones.ts'
export type {
  ResultadoConcluido, CalibracionZona, ResultadoConCargas, CalibracionCargas,
  ResultadoConPuja, CalibracionPuja,
} from './adjudicaciones.ts'
// Deuda con la comunidad (art. 9.1.e LPH) y coste del dinero del puente: las
// dos partidas que no publica nadie y que se comen el margen.
export { deudaComunidadEstimada, tienePropiedadHorizontal, ANUALIDADES_MAXIMAS, ANIOS_IMPAGO_ASUMIDOS, CUOTA_M2_MES } from './comunidad.ts'
export type { DeudaComunidad, EntradaComunidad } from './comunidad.ts'
export { costeFinanciacion, DIAS_PARA_PAGAR, MESES_PUENTE_ASUMIDOS } from './financiacion.ts'
export type { ParamsFinanciacion, CosteFinanciacion } from './financiacion.ts'
// API oficial de Idealista (Search API): consulta directa por zona vigilada,
// mismo corpus y mismo dedupe que las alertas de correo
export { comparablesDesdeApiIdealista, tipoDesdePropertyType, centroBusquedaIdealista, llamadasPermitidasIdealista, IDEALISTA_LIMITE_MENSUAL, IDEALISTA_MARGEN_MENSUAL, IDEALISTA_DIAS_CACHE_ZONA } from './idealista-api.ts'
export type { AnuncioIdealistaApi, RespuestaIdealistaApi, CentroBusqueda } from './idealista-api.ts'
// Fotocasa: mismas zonas, más particulares — segunda fuente de comparables
export { parsearAlertaFotocasa, esAlertaFotocasa, datosFichaFotocasa, PORTAL_FOTOCASA } from './fotocasa.ts'
export type { FichaFotocasa } from './fotocasa.ts'
export { slugZonaFotocasa, slugDistritoFotocasa, slugNucleoPlaya, MIN_MUESTRA_ZONA } from './zona.ts'
export type { ZonaPortal } from './zona.ts'

// Lente flip (comprar-reformar-vender), radar playa y análisis documental
export { evaluarFlip, reformaEstimada, REFORMA_EUR_M2, PCT_COSTES_VENTA, FLIP_MARGEN_MIN } from './flip.ts'
export type { Flip } from './flip.ts'
export {
  esPlaya, esPlayaHuelva, esPlayaCadiz, costaDe,
  MUNICIPIOS_PLAYA_HUELVA, NUCLEOS_PLAYA_HUELVA,
  MUNICIPIOS_PLAYA_CADIZ, NUCLEOS_PLAYA_CADIZ,
  TOPE_PLAYA,
} from './playa.ts'
// De qué está hecho el «valor de mercado»: metros que no inflan, descuento por
// estado del edificio y zonas demasiado gruesas para tasar nada.
export {
  granularidadZona, referenciaOrientativa, superficieValorable, ajusteEstado,
  MUNICIPIOS_HETEROGENEOS, AJUSTE_ESTADO,
} from './valoracion.ts'
export type { GranularidadZona, SuperficieValorable, AjusteEstado } from './valoracion.ts'
export { analisisDocumental } from './analisis.ts'
export type { AnalisisDocumental, PuntoAnalisis, Nivel } from './analisis.ts'

// Ciclo de vida: vigente / cerrada / archivada. Las pasadas salen de la vista
// pero NUNCA se borran (sin ellas no hay reaparición ni calibración).
export { estadoCiclo, esVigente, seConservaParaAprender, DIAS_PARA_ARCHIVAR } from './ciclo-vida.ts'
export type { EstadoCiclo, EntradaCiclo } from './ciclo-vida.ts'

// Política de aviso: solo lo rentable Y limpio interrumpe por Telegram
export { decidirAviso, DIAS_URGENTE } from './aviso.ts'
export type { DecisionAviso, EntradaAviso, ResultadoAviso } from './aviso.ts'

// La misma finca que vuelve a subasta con el tipo rebajado (identidad por catastro)
export { detectarReapariciones, claveFinca, textoReaparicion, BAJADA_MINIMA } from './reaparicion.ts'
export type { Convocatoria, Reaparicion } from './reaparicion.ts'

// Serie de valoración PROPIA a partir de las tasaciones pactadas en las escrituras
export { referenciaPorZona, MIN_MUESTRA_TASACIONES } from './valoracion-historica.ts'
export type { TasacionPactada, ReferenciaZona } from './valoracion-historica.ts'

// Cargas registrales: cuadro estructurado + QUÉ SUBSISTE para el adjudicatario.
// La regla de subsistencia es determinista a propósito (de ella sale la puja).
export {
  normalizarCuadroCargas,
  cargasQueSubsisten,
  mismoAcreedorQueEjecutante,
  consensoCuadros,
  resumirCargas,
  compararCuadros,
  CONFIANZA_MINIMA_LIBRE,
} from './cargas.ts'
export type { Carga, CuadroCargas, CargasSubsistentes, TipoCarga, RangoCarga, FuenteCargas, ValoracionPactada, CambioCargas } from './cargas.ts'
export { PROMPT_LECTOR_REGISTRAL, extraerJson } from './cargas-prompt.ts'
// Caducidad de las anotaciones de embargo (art. 86 LH): la carga fantasma que
// infla el coste. Marca y cuantifica el escenario alternativo; nunca descuenta.
export { estadoCaducidad, caducidadDelCuadro, parsearFechaRegistral, ANIOS_CADUCIDAD_ANOTACION, MESES_MARGEN } from './caducidad.ts'
export type { Caducidad, EstadoCaducidad, CaducidadCuadro } from './caducidad.ts'

// Rescate de PDFs escaneados (certificaciones fotocopiadas → imágenes legibles)
export { localizarJpegs, dimensionesJpeg, agruparBandas, pareceEscaneado } from './pdf-imagenes.ts'
export type { ImagenEmbebida, DimensionesJpeg, BandaAgrupable } from './pdf-imagenes.ts'

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
