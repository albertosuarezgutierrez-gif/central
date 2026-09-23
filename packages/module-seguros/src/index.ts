export {
  KM_ANUALES_SUPUESTOS,
  KM_ANUALES_MAXIMO,
  kilometrosDesdeTexto,
  supuestosVigentes,
  type SupuestoConCampo,
} from './supuestos-auto.ts'

export {
  PROHIBIDO,
  ACOTA_AMBITO,
  revisarCopy,
  explicarInfracciones,
  type ReglaCopy,
  type Infraccion,
} from './copy-regulado.ts'

export {
  esCarteraViva,
  esVolcadoHistorico,
  sqlCarteraViva,
  sqlVolcadoHistorico,
  WHERE_CARTERA_VIVA,
  WHERE_VOLCADO_HISTORICO,
  esCarteraEnVigor,
  esCarteraNoEnVigor,
  sqlCarteraEnVigor,
  sqlCarteraNoEnVigor,
  WHERE_CARTERA_EN_VIGOR,
  type EntradaCarteraViva,
  type EntradaCarteraEnVigor,
} from './cartera-viva.ts'

export {
  POLIZA_ESTADOS_VIGENTES,
  esEstadoVigente,
  vigenciaPoliza,
  explicarVigenciaPendiente,
  type Vigencia,
  type EstadoPolizaVigente,
} from './vigencia.ts'

export {
  DIAS_PREAVISO_TOMADOR,
  DIAS_PREAVISO_ASEGURADOR,
  DIAS_HORIZONTE_RENOVACION,
  DIAS_ANUALIDAD,
  inicioVentanaRecuperacion,
  esVencidaRecuperable,
  descripcionDias,
  diasHastaVencimiento,
  fechaLimiteOposicion,
  fechaLimiteComunicacionAseguradora,
  comunicacionEnPlazo,
  urgenciaRenovacion,
  etiquetaUrgencia,
  primaReferencia,
  primaEnRiesgo,
  type UrgenciaRenovacion,
} from './vencimientos.ts'

export {
  objetoAsegurado,
  pareceMatricula,
  formatCapitales,
  type ObjetoAsegurado,
  type EstadoObjeto,
  type EntradaObjeto,
} from './objeto.ts'

export {
  MODALIDADES_RC,
  etiquetaModalidadRc,
  tituloModalidadRc,
  validarModalidadRc,
  type ModalidadRc,
  type ValidacionRc,
} from './rc-modalidad.ts'

export {
  RAMOS_CON_DIRECCION_RIESGO,
  admiteDireccionRiesgo,
  validarDireccionRiesgo,
  type DireccionRiesgo,
  type ValidacionDireccionRiesgo,
} from './direccion-riesgo.ts'

export {
  saludIngesta,
  detalleSalud,
  DIAS_CUARENTENA_RECIENTE,
  HORAS_RECHAZO_RECIENTE,
  HORAS_PULL_MUDO,
  DIAS_AVISO_PURGA,
  DIAS_RECORDATORIO_INGESTA,
  decidirAvisoIngesta,
  firmaAvisoIngesta,
  normalizarFirmaIngesta,
  decidirRespaldoPull,
  HORAS_RESPALDO_PULL,
  repartirHuerfanas,
  textoHuerfanas,
  TOPE_POLIZAS_TELEGRAM,
  type EstadoIngesta,
  type SaludIngesta,
  type EntradaSalud,
  type FicheroEnCuarentena,
  type EntradaRechazada,
  type CrudoPendiente,
  type CoberturaResumen,
  type CajaNegraCodeoscopic,
  type UltimoPullIngesta,
  type FicheroParcial,
  type MotivoAviso,
  type DecisionAviso,
  type DecisionRespaldoPull,
  type PolizaHuerfana,
  type PolizaEnCartera,
  type GrupoHuerfanas,
  type RepartoHuerfanas,
  type CampoImportanteSinLeer,
} from './ingesta.ts'
export {
  veredictoEntidad,
  silencioPorEntidad,
  motivosSilencio,
  MIN_HUECOS,
  FACTOR_SILENCIO,
  SUELO_DIAS,
  type VeredictoEntidad,
  type EntidadIngesta,
  type SilencioEntidad,
} from './silencio-entidad.ts'
export {
  MARCADORES_SIN_DATO,
  CAMPOS_PERSONALES,
  autoLeidoVacio,
  normalizarAutoLeido,
  seLeyoAlgo as seLeyoAlgoAuto,
  camposLeidos,
} from './documento-auto.ts'
export type { AutoLeido } from './documento-auto.ts'
export {
  CAMPOS_PERSONALES_HOGAR,
  hogarLeidoVacio,
  normalizarHogarLeido,
  seLeyoAlgoHogar,
  camposLeidosHogar,
} from './documento-hogar.ts'
export type { HogarLeido } from './documento-hogar.ts'

export { importeEiac, sumarImportesEiac } from './importe-eiac.ts'
export {
  interpretarCapital,
  extraerDetalleCobertura,
  type CapitalCobertura,
  type DetalleCobertura,
  type LimiteCobertura,
  type FranquiciaCobertura,
  type PrimaCobertura,
} from './cobertura-detalle.ts'
export {
  resumirRecibos,
  estadoCobro,
  explicarCobro,
  type ReciboCrudo,
  type ReciboResumen,
  type RecibosPoliza,
  type EstadoCobro,
} from './recibos.ts'
export {
  MINIMO_TEXTO,
  planBusqueda,
  avisoDireccion,
  explicarVacio,
  normalizarDireccion,
  direccionCoincide,
  type Criterio,
  type TipoCriterio,
  type PlanBusqueda,
  type Aviso,
  type Cobertura,
} from './busqueda.ts'
export {
  DIAS_SUSPENSION,
  DIAS_EXTINCION,
  retencion,
  resumirRetencion,
  type EstadoRetencion,
  type SituacionRecibo,
  type Retencion,
  type ResumenRetencion,
} from './retencion.ts'
export {
  MESES_CARTERA_VIVA,
  vitalidadFicha,
  etiquetaVitalidad,
  explicarVitalidad,
  avisoHermanas,
  type Vitalidad,
  type SenalesFicha,
  type Hermana,
  type AvisoHermanas,
} from './vitalidad.ts'
export {
  etiquetaRol,
  contactoEfectivo,
  filasIntervinientes,
  personasDePolizas,
  type IntervinienteFicha,
  type ContactoEfectivo,
  type FilasIntervinientes,
  type PersonaDePolizas,
} from './intervinientes.ts'
export {
  emailAlternativo,
  type AllegadoConEmail,
  type EmailAlternativo,
} from './contacto-alternativo.ts'
export {
  FRACCIONES,
  etiquetaFraccionamiento,
  etiquetaFormaPago,
  recargoFraccionamiento,
  ventanaAnulacion,
  type ReciboCiclo,
  type RecargoFraccionamiento,
} from './pago.ts'
export {
  TIPOS_DOCUMENTO,
  MIMES_DOCUMENTO,
  MAX_BYTES_DOCUMENTO,
  MAX_ADJUNTOS_POR_PARTE,
  NECESARIOS_EMISION_AUTO,
  etiquetaTipoDocumento,
  etiquetaEstadoDocumento,
  tipoDocumento,
  estadoDocumento,
  revisarDocumento,
  mimeDocumento,
  mimeParaServir,
  tipoAdjuntoParte,
  resumenDocumentos,
  documentosQueFaltan,
  type TipoDocumento,
  type EstadoDocumento,
  type MimeDocumento,
  type DocumentoResumen,
  type ResumenDocumentos,
} from './documentos.ts'
export {
  retarificabilidad,
  RIESGO_HOGAR_MINIMO,
  numeroPositivo,
  anioPlausible,
  cpValido,
  type Retarificabilidad,
  type RamoRetarificable,
  type EntradaRetarificable,
} from './retarificable.ts'
export {
  ETIQUETAS_TELEFONO,
  ETIQUETAS_EMAIL,
  CAMPOS_IDENTIDAD,
  CAMPOS_LIBRES,
  ETIQUETA_CAMPO,
  MOTIVO_DOCUMENTO_REQUERIDO,
  etiquetaContacto,
  normalizarTelefono,
  normalizarEmail,
  normalizarContacto,
  normalizarDni,
  etiquetasIdentidad,
  enmascararDni,
  normalizarFechaNacimiento,
  normalizarNombre,
  normalizarCp,
  provinciaPorCp,
  revisarEdicion,
  documentoAcredita,
  documentosAcreditativos,
  textoHistorialEdicion,
  revisarAlta,
  coincidenciaBloquea,
  FUENTES_ORIGEN,
  FUENTES_CANAL,
  ETIQUETA_FUENTE,
  TIPOS_HISTORIAL,
  esFuenteCanal,
  fuenteOrigen,
  tipoHistorial,
  tipoHistorialAlta,
  textoHistorialAlta,
  type FuenteOrigen,
  type TipoHistorial,
  type Revisado,
  type TipoContacto,
  type ContactoCliente,
  type TipoPersona,
  type EtiquetasIdentidad,
  type CampoIdentidad,
  type CampoLibre,
  type EdicionCliente,
  type IdentidadRevisada,
  type EdicionRevisada,
  type AltaCliente,
  type AltaRevisada,
  type Coincidencia,
} from './cliente-edicion.ts'
export {
  TIPOS_RELACION,
  GRUPOS_RELACION,
  SIN_VINCULO,
  permiteAutorizar,
  tipoRelacion,
  tipoInverso,
  relacionesDeFicha,
  clientesVisiblesPara,
  explicarAutorizacion,
  type TipoRelacion,
  type RelacionFila,
  type RelacionFicha,
} from './relaciones.ts'
export { mensajePresentacionWhatsapp } from './mensaje-whatsapp.ts'
export {
  estadoCliente,
  DIAS_PRESUPUESTO_VIVO,
  type EstadoCliente,
  type SenalesCliente,
  type EstadoClienteDerivado,
} from './estado-cliente.ts'
export {
  combinarPersonaContacto,
  textoPersonaContacto,
  tiposContactoSugeridos,
  FUENTE_PERSONA_CONTACTO,
  type PasoEscritura,
  type ResultadoPersonaContacto,
} from './persona-contacto.ts'
export {
  unificarPersonas,
  saleEnPolizas,
  type ListaPersonasFicha,
  type PersonaFicha,
  type VinculoUnible,
} from './personas-ficha.ts'
export {
  normalizarNumeroPoliza,
  polizasDuplicadas,
  type PolizaParaDuplicados,
  type GrupoDuplicado,
} from './duplicados.ts'
export {
  ESTADOS_SINIESTRO,
  TRANSICIONES_SINIESTRO,
  TIPOS_SINIESTRO,
  GRAVEDADES_SINIESTRO,
  DIAS_COMUNICACION_LCS,
  CAMPOS_SEGUIMIENTO_CIMA,
  CAMPOS_SEGUIMIENTO_PROPIO,
  esEstadoSiniestro,
  esTipoSiniestro,
  etiquetaEstadoSiniestro,
  etiquetaTipoSiniestro,
  revisarTransicion,
  plazoComunicacion,
  revisarApertura,
  revisarSeguimiento,
  anadirNota,
  textoHistorialSiniestro,
  type EstadoSiniestro,
  type OrigenSiniestro,
  type ClaveTipoSiniestro,
  type PlazoComunicacion,
  type AperturaSiniestro,
  type AperturaRevisada,
  type SeguimientoSiniestro,
  type SeguimientoRevisado,
} from './siniestros.ts'

export {
  EIAC_TIPOLOGIA_SINIESTRO,
  descripcionEiacSiniestro,
} from './eiac-siniestros.ts'
export {
  RAMOS_SINIESTRO,
  RAMOS_SINIESTRO_CON_CATALOGO,
  CAMPOS_POR_RAMO_SINIESTRO,
  MAX_TEXTO_RAMO_SINIESTRO,
  camposDeRamoSiniestro,
  normalizarDatosRamoSiniestro,
  type TipoCampo as TipoCampoRamoSiniestro,
  type OpcionCampo as OpcionCampoRamoSiniestro,
  type CampoRamoSiniestro,
  type RamoSiniestro,
  type DatosRamoSiniestro,
  type ResultadoDatosRamoSiniestro,
} from './siniestro-ramo.ts'
export {
  TIPOS_INTERVINIENTE,
  esTipoInterviniente,
  revisarInterviniente,
  type TipoInterviniente,
  type IntervinienteEntrada,
  type IntervinienteRevisado,
} from './siniestro-intervinientes.ts'
export {
  evolucionPrima,
  etiquetaVeredictoPrima,
  inicioCiclo,
  UMBRAL_IGUAL_PCT,
  UMBRAL_SUBIDA_GENERAL_PCT,
  type ReciboEvolucion,
  type SiniestroEvolucion,
  type Anualidad,
  type VeredictoPrima,
  type EvolucionPrima,
} from './prima-evolucion.ts'
export {
  prepararPolizaEmitida,
  emparejarConCima,
  conciliarConCima,
  sanearPrima,
  seguimientoSustitucion,
  validarPolizaOrigen,
  TIPOS_SEGURO,
  PRIMA_ANUAL_MAX,
  MARGEN_FECHA_INICIO_DIAS,
  type CompaniaDgs,
  type ProyectoEmitido,
  type PolizaEmitida,
  type PreparacionEmision,
  type PolizaCandidata,
  type PolizaCima,
  type Emparejamiento,
  type NuestraPoliza,
  type CimaPoliza,
  type Conciliacion,
  type SeguimientoSustitucion,
  type ValidacionPolizaOrigen,
} from './emision.ts'
export {
  ladoDeGarantia,
  capitalAsegurado,
  capitalesHogar,
  eurDeCapital,
  eurDeCapitalConVolcado,
  importeDelVolcado,
  GARANTIAS_MINIMAS_CONSENSO,
  CAPITAL_DEL_VOLCADO_MOTIVO,
  type LadoRiesgo,
  type CoberturaLeible,
  type CapitalAsegurado,
  type CapitalesHogar,
  type CapitalVolcado,
  type CapitalesVolcado,
} from './garantias.ts'
export {
  clasificarPolizaFicha,
  resumenFicha,
  type ClasePolizaFicha,
  type PolizaResumible,
  type ProximoVencimiento,
  type ResumenFicha,
} from './ficha-resumen.ts'
export {
  agruparHistoricas,
  type HistoricaAgrupable,
  type GrupoHistorica,
} from './ficha-historicas.ts'
export { caducidadCarnet, type CaducidadCarnet } from './caducidad-carnet.ts'
export {
  parseFiltroCartera,
  filtroActivo,
  describirFiltro,
  diasDeVentana,
  etiquetaRamo,
  RAMOS,
  ESTADOS,
  VENTANAS,
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAX,
  MIN_LETRAS_BUSQUEDA,
  type RamoSeguro,
  type GrupoCartera,
  type EstadoPolizaFiltro,
  type VentanaVencimiento,
  type FiltroCanal,
  type FiltroCartera,
  type ParseFiltro,
} from './filtro-cartera.ts'

export {
  ACTIVIDADES,
  PASOS_EMBUDO,
  VENTANAS_ACTIVIDAD,
  DIAS_ACTIVIDAD_DEFECTO,
  POR_PAGINA_ACTIVIDAD,
  POR_PAGINA_ACTIVIDAD_MAX,
  definicionActividad,
  etiquetaActividad,
  riesgoActividad,
  parseFiltroActividad,
  mayorCaidaEmbudo,
  nuevosDesde,
  type OrigenActividad,
  type TipoActividad,
  type EventoActividad,
  type QuienActividad,
  type FiltroActividad,
  type EmbudoPortal,
  type PasoEmbudo,
} from './actividad.ts'

export {
  planBackfillDni,
  tokensNombre,
  type FichaDni,
  type Destino,
  type FilaPlan,
  type GrupoChoque,
  type GrupoCompartido,
  type PlanBackfillDni,
} from './backfill-dni.ts'

export {
  planBackfillContacto,
  type CampoContacto,
  type OrigenContacto,
  type FilaContacto,
  type DestinoContacto,
  type FilaPlanContacto,
  type GrupoChoqueContacto,
  type CuentaContacto,
  type Derivados,
  type PlanBackfillContacto,
} from './backfill-contacto.ts'

export {
  ALFABETO_SERIE,
  PRIMERA_MATRICULA_MODERNA,
  ULTIMO_HITO_CONOCIDO,
  normalizarMatricula,
  formatoMatricula,
  ordinalMatricula,
  fechaMatriculacionEstimada,
  type FormatoMatricula,
  type MatriculacionEstimada,
} from './matricula.ts'

export {
  MEDIADOR,
  NO_EXCLUSIVIDAD,
  CANALES_RECLAMACION,
  PUNTOS_PRECONTRACTUALES,
  VERSION_TEXTOS_LEGALES,
  FECHA_TEXTOS_LEGALES,
  VERSION_TEXTOS_WEB,
  FECHA_TEXTOS_WEB,
  lineaIdentificacion,
  remitenteCorreo,
  telefonoLegible,
  whatsappUrl,
  type CanalReclamacion,
  type IdCanalReclamacion,
  type PuntoPrecontractual,
  type IdPuntoPrecontractual,
} from './mediador.ts'

export {
  TOPE_AVISO_SINIESTROS,
  decidirSiniestrosNuevos,
  detalleSiniestros,
  textoAvisoSiniestros,
  serializarMarca,
  leerMarca,
  type SiniestroEntrante,
  type MarcaSiniestros,
  type DecisionSiniestros,
} from './siniestro-nuevo.ts'

// El vigía de los partes del portal que nadie ha abierto todavía en la
// compañía. Lee su cabecera: el corte es `comunicado`, y `recibido` —que
// parece atendido— sigue dentro a propósito.
export {
  TOPE_AVISO_PARTES,
  firmaPartes,
  ordenarPorUrgencia,
  partesPendientes,
  textoAvisoPartes,
  textoUrgencia,
  urgenciaParte,
} from './parte-vigilancia.ts'
export type { ParteVigilado, UrgenciaParte, AvisoPartes } from './parte-vigilancia.ts'

// El paquete del derecho de acceso (art. 15) y portabilidad (art. 20). Su
// cabecera explica por qué un volcado de tablas NO es un export del art. 15 y
// por qué solo lo aportado por la persona es portable.
export {
  CATEGORIAS_EXPORT,
  FICHA_CATEGORIA,
  INFORMACION_ART15,
  MOTIVO_TEXTO,
  construirExport,
  esPortable,
} from './export-rgpd.ts'
export type {
  CategoriaExport,
  OrigenDatos,
  BloqueExport,
  MotivoAusencia,
  InformacionArt15,
  ExportRgpd,
  EntradaExport,
} from './export-rgpd.ts'

export { ordenPolizasFicha } from './orden-polizas.ts'
export type { PolizaOrdenable } from './orden-polizas.ts'

export { leerSitio, textoReparoSitio } from './sitio.ts'
export type { Sitio, SitioLeido, ReparoSitio } from './sitio.ts'

export {
  NORMAS_CITABLES,
  normaPorId,
  citaLegible,
  mencionesNormativas,
  citasNoRespaldadas,
  idsDesconocidos,
} from './normas.ts'
export type { NormaCitable } from './normas.ts'
export { nombreDePila } from './nombre-de-pila.ts'

export { COOLDOWN_DIAS, enCooldown, textoBaseRecaptacionWhatsapp, textoBaseRecaptacionEmail } from './recaptacion.ts'
export type { EnvioRecienteRecaptacion, PersonalizacionRecaptacion } from './recaptacion.ts'

export { COOLDOWN_RENOVACION_DIAS, enCooldownRenovacion, textoAvisoRenovacionWhatsapp } from './renovacion-contacto.ts'
export type { ContactoReciente, PersonalizacionRenovacion } from './renovacion-contacto.ts'

export {
  AREAS_CONTACTO,
  areaContacto,
  etiquetaArea,
  ordenarContactos,
  contactoDestacado,
  type AreaContacto,
  type ContactoCompania,
} from './compania-contactos.ts'

// Pólizas que el corredor recibe por su cuenta y sube él (no las declara el cliente).
export {
  clasificarCoincidencias,
  clavesCotejo,
  partirNombre,
  puedeEnlazarse,
  proyectarVencimiento,
  tipoPersonaDeNombre,
  prepararAltaDesdeDocumento,
  prepararDeclaradaDesdeDocumento,
} from './poliza-de-documento.ts'
export type {
  AltaDesdeDocumento,
  AvisoDocumento,
  ClavesCotejo,
  Cotejo,
  DeclaradaDesdeDocumento,
  LecturaPoliza,
  TipoLecturaDocumento,
  TipoPersonaDocumento,
} from './poliza-de-documento.ts'

// El presupuesto que ve el CLIENTE: estado derivado de los sellos, caducidad
// (mínimo de tres fuentes) y la regla de las tres opciones de portada.
export {
  VALIDEZ_PRESUPUESTO_DIAS,
  admiteDecision,
  calcularVencimiento,
  constaEnvio,
  elegirPortada,
  estadoPresupuesto,
} from './presupuesto-cliente.ts'
export type {
  EstadoPresupuesto,
  FuenteVencimiento,
  OpcionPortada,
  PapelPortada,
  Portada,
  SellosPresupuesto,
  SinEquivalente,
  Vencimiento,
} from './presupuesto-cliente.ts'

// Defensa de cartera: en qué compañías el cliente YA está, y qué se puede
// decir de una fila de precio por eso. Cuatro estados, `desconocida` incluida.
export {
  normalizarCompania,
  resolverCompania,
  polizaDefiende,
  defensaDeCartera,
  bloqueaEmision,
  etiquetaDefensa,
  fraseDefensa,
  type CompaniaCatalogo,
  type IdentidadCompania,
  type PolizaCliente,
  type EstadoDefensa,
  type PolizaEnLaCompania,
  type Defensa,
  type EntradaDefensa,
} from './defensa-cartera.ts'

// La tabla de precios con sentido: agrupada por nivel de cobertura (que NO son
// comparables entre sí) y con filtros cuyo valor no reconocido se DECLARA.
export {
  nivelCobertura,
  parseFiltroPrecios,
  filtroPreciosActivo,
  describirFiltroPrecios,
  agruparPrecios,
  eurEs,
  FIRMEZAS,
  FRANQUICIAS,
  FILTRO_PRECIOS_VACIO,
  type FamiliaNivel,
  type Nivel,
  type FirmezaPrecio,
  type PrecioComparable,
  type FilaPrecio,
  type FiltroFranquicia,
  type FiltroPrecios,
  type ParseFiltroPrecios,
  type GrupoCobertura,
  type Comparativa,
  type OpcionesComparativa,
} from './comparativa-precios.ts'
export {
  DIAS_ENTRE_LLAMADAS_RESPONDIO, DIAS_LLAMADA, DIAS_PRIMER_CONTACTO, DIAS_RECORDATORIO, MAX_INTENTOS, MAX_INTENTOS_RESPONDIO,
  canalLead, diasHasta, pasoConTarea, proximoAniversario, puntuarLead, siguientePasoLead, textoPasoLead, ventanaDe,
} from './lead-competencia.ts'
export type { CanalLead, DatosPuntuacion, PasoLead, VentanaLead } from './lead-competencia.ts'
export { MOTIVOS_PERDIDA, PRIORIDADES_TAREA, TIPOS_TAREA, aplicarAccion, validarTarea } from './oportunidad-seguimiento.ts'
export {
  DIAS_APARCAR_NO_INTERESA, DIAS_PREPARAR_PRECIO, MAX_DIAS_RELLAMADA, PREFIJO_LLAMADA_CONTESTADA, PREFIJO_LLAMADA_SIN_RESPUESTA,
  RESULTADOS_LLAMADA, planLlamada,
} from './llamada-resultado.ts'
export type { PlanLlamada, ResultadoLlamada } from './llamada-resultado.ts'
export type {
  AccionOportunidad,
  Cambios as CambiosOportunidad,
  EstadoActual as EstadoActualOportunidad,
  EstadoOportunidad,
  MotivoPerdida,
  PeticionAccion,
  PrioridadTarea,
  ResultadoAccion,
  TareaValida,
  TipoTarea,
} from './oportunidad-seguimiento.ts'
export {
  TIPOS_YA_AVISADOS,
  VENTANA_MINUTOS,
  claveEvento,
  decidirAvisosActividad,
  desdeConsulta,
  detalleActividad,
  leerMarcaActividad,
  mensajeActividad,
  serializarMarcaActividad,
} from './actividad-aviso.ts'
export type { DecisionActividad, MarcaActividad } from './actividad-aviso.ts'
