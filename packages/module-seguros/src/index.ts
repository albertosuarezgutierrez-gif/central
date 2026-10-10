export { bloqueoCompania, textoBloqueoCorredor, textoBloqueoCliente, esAllianz, RECORDATORIO_ALLIANZ_CORTO } from './bloqueo-compania.ts'
export {
  franquiciaDelTexto,
  revisarCoherenciaCotizacion,
  reparosPorFila,
  PREFIJO_HISTORIAL_COTIZACION_INCOHERENTE,
} from './coherencia-cotizacion.ts'
export type { PrecioParaCoherencia, ReparoCotizacion, TipoReparoCotizacion } from './coherencia-cotizacion.ts'

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
  textoPlazoOposicion,
  fechaLimiteComunicacionAseguradora,
  comunicacionEnPlazo,
  urgenciaRenovacion,
  etiquetaUrgencia,
  primaReferencia,
  primaConRecibos,
  vencimientoConRecibos,
  type ReciboVigencia,
  primaEnRiesgo,
  type UrgenciaRenovacion,
} from './vencimientos.ts'

export {
  leerDatosCompaniaCima,
  leerDatosCompaniaPuerto,
  rotuloAnulacionCima,
  type DatosCompaniaCima,
  type AnulacionCima,
  type PolizaReemplazadaCima,
  type SuplementoCima,
  type OtroDatoCima,
  type InmuebleCima,
  type EmbarcacionCima,
} from './datos-compania-cima.ts'

export {
  objetoAsegurado,
  pareceMatricula,
  formatCapitales,
  fichaObjeto,
  bastidorOperador,
  type DatoObjeto,
  type ObjetoAsegurado,
  type EstadoObjeto,
  type EntradaObjeto,
} from './objeto.ts'
export { lineaFichaObjeto, lineaConductor } from './ficha-objeto-linea.ts'

export { etiquetaClave, claveEiacConocida, CLAVES_EIAC, type TablaClaveEiac } from './claves-eiac.ts'
export {
  etiquetaPapel,
  figuraDeCima,
  terceroDeCima,
  figurasDePoliza,
  tercerosDeSiniestro,
  vidaDePoliza,
  decesosDePoliza,
  personasDePoliza,
  leerPersonasPuerto,
  textoDomicilio,
  textoBeneficiario,
  actividadesVida,
  textoDuracionPrestamo,
  PAPELES_FIGURA_CIMA,
  ACTIVIDADES_VIDA,
  MAX_FIGURAS_CIMA,
  type DescifrarFigura,
  type PapelFiguraCima,
  type DomicilioCimaFigura,
  type FiguraFicha,
  type TerceroFicha,
  type PrestamoFicha,
  type VidaFicha,
  type DecesosFicha,
  type PersonasPoliza,
  type ActividadVida,
} from './figuras-cima.ts'
export { fechaPintable, diaIsoPintable } from './fecha-pintable.ts'
export { alertaVencimiento, hoyMadrid } from './alerta-vencimiento.ts'
export type { AlertaVencimiento, EstadoAlertaVencimiento } from './alerta-vencimiento.ts'
export { ETIQUETA_POTENCIA, ETIQUETA_USO_VEHICULO } from './objeto.ts'

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
  DIAS_GRACIA_RENOVACION,
  textoRenovacionesSinLlegar,
  HORAS_EMISION_SIN_AVISO,
  textoEmisionesSinAviso,
  textoPolizasDuplicadas,
  cambioDuplicadasEnFirma,
  cambioAnulacionesEnFirma,
  firmaPreviaIgnorandoAnulaciones,
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
  type RenovacionSinLlegar,
  type EmisionSinAviso,
} from './ingesta.ts'

export {
  HORAS_VENTANA_ANULACION_BLOQUE,
  HORAS_RECIBO_ANULADO_SIN_REEMISION,
  UMBRAL_ANULACION_BLOQUE,
  MIN_ANULADAS_BLOQUE,
  evaluarAnulacionesEnBloque,
  agruparPosiblesBajas,
  textoAnulacionesEnBloque,
  textoRenovacionesAnuladas,
  textoRetrasoAnulacion,
  textoPosiblesBajas,
  type FicheroAnulacionFila,
  type AnulacionEnBloque,
  type RetrasoAnulacion,
  type RenovacionAnuladaPorCompania,
  type PosibleBaja,
  type PosiblesBajasPorCompania,
} from './anulacion-bloque.ts'
export {
  corteSiniestros,
  textoCorteSiniestros,
  HORAS_CORTE_SINIESTROS,
  type CorteSiniestros,
  type EntradaCorte,
} from './corte-siniestros.ts'
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
  ACUERDO_DIRECTO,
  TOLERANCIA_PUNTOS,
  lineasComision,
  pctRecibo,
  resolverCuadro,
  type CuadroFila,
  type EntradaCuadro,
  type ExtraAcuerdo,
  type LineaComision,
  type ReciboComision,
  type VeredictoComision,
} from './comision-pactada.ts'
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
  referenciaCatastral,
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
  seraPrincipalAlAnadir,
  normalizarDni,
  etiquetasIdentidad,
  enmascararDni,
  normalizarFechaNacimiento,
  normalizarNombre,
  normalizarCp,
  provinciaPorCp,
  revisarEdicion,
  nombrePendiente,
  documentoAcredita,
  documentosAcreditativos,
  acreditarCambioConDocumento,
  documentoCubreCampos,
  camposIdentidadTocados,
  estadoDocumentosIdentidad,
  CAMPOS_QUE_ACREDITA_POLIZA,
  type AcreditacionCambio,
  textoHistorialEdicion,
  MOTIVO_CAMBIO_REQUERIDO,
  MOTIVO_CAMBIO_MINIMO,
  motivoCambioValido,
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
  type SexoFicha,
  SEXOS_FICHA,
  SALUDO_POR_SEXO,
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
export { mensajePresentacionWhatsapp, mensajeRenovacionLeadWhatsapp } from './mensaje-whatsapp.ts'
export { mensajeReciboDevueltoWhatsapp, resumenRiesgo, saludoSegunHora, type EntradaWhatsappDevuelto } from './mensaje-recibo-devuelto.ts'
export { correoPresupuesto, lineaDatosQueFaltan, mensajePresupuestoWhatsapp, type CorreoPresupuesto, type DatosAvisoPresupuesto } from './mensaje-presupuesto.ts'
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
  claveParNoDuplicado,
  grupoResueltoNoDuplicado,
  numeroPolizaComparable,
  agruparDuplicadas,
  gruposVivosDuplicados,
  origenFicha,
  ORIGENES_FICHA,
  paresNoDuplicado,
  limpiarMotivoNoDuplicado,
  MOTIVO_NO_DUPLICADO_MAX,
  MAX_POLIZAS_MARCA,
  type FichaClaveDuplicado,
  type GrupoFichas,
  type OrigenFicha,
  type EntradaOrigenFicha,
  type FichaDuplicada,
  type MarcaNoDuplicado,
  type PolizaParaDuplicados,
  type GrupoDuplicado,
  type PolizaParaVigiaDuplicadas,
  type GrupoVivoDuplicado,
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
  DIAS_VENTANA_VINCULO,
  candidatosDeParte,
  cambiosDeFusion,
  conocidoPorCompania,
  diasEntre,
  emparejarManualConCima,
  emparejarParte,
  fusionesAutomaticas,
  normalizarNumeroSiniestro,
  vinculosAutomaticos,
  type CamposCorredor,
  type EmparejamientoSiniestro,
  type ParteParaVincular,
  type SiniestroCandidato,
} from './siniestro-vinculo.ts'
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
  normalizarValorCampoSiniestro,
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
  siguientePaso,
  DIAS_AVISO_RENOVACION,
  type EntradaSiguientePaso,
  type SiguientePaso,
} from './siguiente-paso.ts'
export {
  agruparHistoricas,
  type HistoricaAgrupable,
  type GrupoHistorica,
} from './ficha-historicas.ts'
export { caducidadCarnet, type CaducidadCarnet } from './caducidad-carnet.ts'
export { TIPOS_CARNET, claveTipoCarnet, revisarCarnet, type CarnetRevisado, type TipoCarnet } from './carnet-ficha.ts'
// Lo que una póliza subida sabe del TOMADOR y la ficha no: parche que solo rellena huecos (03/10/2026).
export {
  CLAVES_EXTRACCION_GUARDABLES,
  CLAVES_PERSONALES_EXTRACCION,
  DIAS_VENCIMIENTO_URGENTE,
  companiaLegible,
  companiaPorNombre,
  cifDeEmpresa,
  esTomadorEmpresa,
  extraccionSinPii,
  identificadorFiscal,
  contactoTomadorVacio,
  emailNormalizado,
  normalizarContactoTomador,
  parcheFichaDesdePoliza,
  parcheVacio,
  polizaFinanciada,
  telefonoEspanol,
  vencimientoUrgente,
  type ConductorPrincipalLeido,
  type ContactoTomadorLeido,
  type ExtraccionFicha,
  type FichaActual,
  type MotivoParche,
  type ParcheFicha,
  type ResultadoParche,
} from './datos-ficha-de-poliza.ts'
export { fechaTextoAIso } from './fecha-texto.ts'
export { anioCumpleanos, diaMadrid, esCumpleanos } from './cumpleanos.ts'
export { ordenarHistorialRiesgo, type EslabonHistorial, type EslabonRiesgo } from './historial-riesgo.ts'
export { agruparCalidad, esReglaCalidad, ORDEN_REGLAS, REGLAS_CALIDAD, type GrupoCalidad, type IncidenciaCalidad, type ReglaCalidad } from './calidad-dato.ts'
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
  PASOS_ADOPCION,
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
  REMITENTE_CORREDURIA,
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
  FAMILIAS_SIN_ESCALA_DE_COBERTURA,
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
  canalLead, diasHasta, pasoConTarea, proximoAniversario, puedeWhatsappLead, puntuarLead, siguientePasoLead, textoPasoLead, ventanaDe,
} from './lead-competencia.ts'
export type { CanalLead, DatosPuntuacion, PasoLead, VentanaLead } from './lead-competencia.ts'
export {
  ESTADOS_ALTA, ESTADOS_ALTA_SERVIDOR, MOTIVOS_PERDIDA, MOTIVOS_PERDIDA_VENTA, MOTIVO_DESCARTE, PRIORIDADES_TAREA, RAMOS_OPORTUNIDAD, TIPOS_TAREA, aplicarAccion,
  seguroAnteriorDe, validarAltaOportunidad, validarEdicionOportunidad, validarTarea,
} from './oportunidad-seguimiento.ts'
export {
  DIAS_APARCAR_NO_INTERESA, DIAS_PREPARAR_PRECIO, MAX_DIAS_RELLAMADA, PREFIJO_LLAMADA_CONTESTADA, PREFIJO_LLAMADA_SIN_RESPUESTA,
  RESULTADOS_LLAMADA, planLlamada, PREFIJO_WHATSAPP_RESPONDIDO, CANALES_RESPUESTA,
} from './llamada-resultado.ts'
export type { CanalRespuesta, PlanLlamada, ResultadoLlamada } from './llamada-resultado.ts'
export type {
  AccionOportunidad,
  AltaValida as AltaOportunidadValida,
  Cambios as CambiosOportunidad,
  EdicionValida as EdicionOportunidadValida,
  EstadoActual as EstadoActualOportunidad,
  EstadoOportunidad,
  MotivoPerdida,
  PeticionAccion,
  PrioridadTarea,
  RamoOportunidad,
  ResultadoAccion,
  SeguroAnterior,
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
export { libroVcard, nombreVisible, vcardContacto } from './vcard.ts'
export type { ContactoMovil, GrupoContacto } from './vcard.ts'
export { TIPOS_EVENTO_CARTERA, TIPOS_FUGA, UMBRAL_DESAPARICION, categoriaMotivo, datosAnulacion, detectarCambios, esFugaSinExplicar, fotoSospechosa, fotoVacia, leerAnulacion, nombreEvento, planRetencionPorMotivo, textoFechaAnulacion, textoMotivoAnulacion, textoUltimoRecibo } from './detector-cartera.ts'
export type { AnulacionEiac, CategoriaMotivo, PlanRetencion, Deteccion, EventoCartera, Foto, HuellaPoliza, HuellaRecibo, HuellaSiniestro, TipoEventoCartera } from './detector-cartera.ts'
export { ORIGEN_RETENCION, decidirRetencion } from './retencion-fuga.ts'
export type { DecisionRetencion, EntradaRetencion } from './retencion-fuga.ts'
export { ACCIONES_APROBACION, DIAS_CADUCIDAD, ESTADOS_APROBACION, POLITICA, TIPOS_ANULACION_ENVIO_SOLO, anulacionSeEnviaSola, borradorAnulacionCompania, borradorCartaMediadorCompania, borradorReciboDevuelto, buzonSugerido, caducaEn, decisionValida } from './aprobaciones.ts'
export type { AccionAprobacion, Borrador, BuzonCompania, Decision, EntradaAnulacionCompania, EntradaReciboDevuelto, EstadoAprobacion, Politica } from './aprobaciones.ts'
export {
  ACCIONES_ANULACION, DIAS_AVISO_VENCIMIENTO_PORTAL, DIAS_ESPERA_CONFIRMACION, DIAS_LIBERACION_DIRECTA, ESTADOS_ANULACION, ESTADOS_ANULACION_ABIERTA, ETIQUETA_ESTADO_ANULACION,
  ETIQUETA_MOTIVO_ANULACION, ETIQUETA_TIPO_ANULACION, HORAS_RETENCION_PORTAL, MOTIVOS_ANULACION, MOTIVOS_PORTAL, SOLICITANTES_ANULACION, TIPOS_ANULACION,
  cartaAnulacion, eurosEs as eurosAnulacionEs, liberaSolaAt, parsearEuros as parsearEurosAnulacion, textoOfertaPrecio, MAX_TEXTO_PRECIO_PORTAL, liberadaParaFirma, resolucionDeAnulacion, solicitudDesdePortal, siguientePaso as siguientePasoAnulacion, transicion as transicionAnulacion, validarSolicitud as validarSolicitudAnulacion,
} from './anulacion.ts'
export type {
  AccionAnulacion, DatosCarta as DatosCartaAnulacion, EstadoAnulacion, MotivoAnulacion, MotivoPortal, OrigenAnulacion, ResultadoSolicitudPortal, SolicitudPortal, SiguientePaso as SiguientePasoAnulacion, SolicitanteAnulacion, SolicitudAnulacion, TipoAnulacion,
} from './anulacion.ts'
export { NECESIDADES_MAX, NECESIDADES_MIN, anulacionPorCambio, documentoAceptacion, esCambioCompania, lineaVistoAntes, validarNecesidades, type AnulacionPorCambio, type DatosAceptacion, type OpcionAceptada, type PolizaActual } from './aceptacion-presupuesto.ts'
export { deducirNecesidades, grupoNecesidades, preguntasNecesidades, textoNecesidades, validarRespuestasNecesidades, type GrupoNecesidades, type OpcionPregunta, type PreguntaNecesidad, type RespuestasNecesidades, type ValidacionRespuestas } from './necesidades-idd.ts'
export { datosDelTomador, huecosParaEmitirDesdeFicha, type CampoEmision, type DatoEmision, type DatoPropioEnPoliza, type DatosParaEmitir, type EstadoDatoEmision, type FichaParaEmitir, type QuienAporta, type ValorLeido } from './datos-para-emitir.ts'
export {
  DIAS_REVISION_TELEFONOS, TELEFONOS_COMPANIAS, esTelefonoPublicable, hrefTel, telefonoVerificadoPorCodigo, telefonoVerificadoPorNombre, telefonosParaPublicar, telefonosPorRevisar, vcardCompania, whatsappLegible,
  type LineaAsistencia, type TelefonoCompania,
} from './telefonos-companias.ts'
export { ACCIONES_CARTA_MEDIADOR, ESTADOS_CARTA_ABIERTA, cartaNombramientoMediador, documentoParaCarta, esCompaniaDeRelleno, transicionCartaMediador, type AccionCartaMediador, type DatosCartaMediador, type EstadoCartaMediador } from './carta-mediador.ts'
export {
  PLAZO_SAC_MESES, DIAS_AVISO_QUEJA, ESTADOS_QUEJA, ESTADOS_QUEJA_CERRADA, ESTADOS_QUEJA_RESUELTA, CANALES_QUEJA, MOTIVOS_QUEJA,
  ETIQUETA_ESTADO_QUEJA, ETIQUETA_MOTIVO_QUEJA, ETIQUETA_CANAL_QUEJA, plazoQueja, diasHastaPlazo, estadoPlazoQueja,
  transicionQuejaValida, validarAltaQueja, validarCierreQueja, validarFechaResolucion, informeSac,
  type EstadoQueja, type CanalQueja, type MotivoQueja, type PlazoQueja, type AltaQueja, type QuejaInforme, type InformeSac,
} from './queja.ts'
export { SUSTITUCION_DIAS_ANTES, SUSTITUCION_DIAS_DESPUES, claveRiesgo, detectarSustituciones, devueltoPorSustitucion, solicitudPorSustitucion, sustituidasARetirar, type DuplicidadDetectada, type PolizaParaSustitucion, type ResultadoSustituciones, type RiesgoComun, type SustitucionDetectada } from './sustitucion-auto.ts'
export { DOBLE_SEGURO_DIAS_TOLERANCIA, avisoDobleSeguro, type AvisoDobleSeguro, type NuevaParaDobleSeguro, type ViejaParaDobleSeguro } from './doble-seguro.ts'
export { informeMediacion, type ReciboInforme, type FilaInforme, type InformeMediacion } from './informe-mediacion.ts'
export { HORAS_MINIMAS_IDD, clavePersona, resumenFormacion, validarAltaFormacion, validarBajaFormacion, type BajaFormacion, type RegistroFormacion, type EstadoFormacion, type ResumenPersona, type ResumenFormacion, type AltaFormacion } from './formacion.ts'
export { MAX_BYTES_IPID, claveProducto, revisarIpid } from './ipid.ts'
export {
  SEMANAS_LINEA_BASE,
  SERIES_LINEA_BASE,
  celdasSerie,
  lunesMadrid,
  proporcionAutomatica,
  semanasLineaBase,
  type CeldaSemana,
  type DefinicionSerie,
  type SerieLineaBase,
} from './linea-base.ts'
export {
  VENTANA_DIAS as VENTANA_SIGUIENTE_ACCION,
  siguienteAccion,
  type DeclaradaAccion,
  type EntradaSiguienteAccion,
  type PolizaAccion,
  type SiguienteAccion,
  type TipoSiguienteAccion,
} from './siguiente-accion.ts'
export {
  CARNETS_MOTO_SOLICITUD,
  DIAS_SOLICITUD,
  GARAJES_SOLICITUD,
  MAX_DOCS_SOLICITUD,
  RAMOS_SOLICITUD,
  TIPOS_DOC_SOLICITUD,
  camposSolicitud,
  conIdentidad,
  contrastarConDocumentos,
  etiquetaDocSolicitud,
  mensajeSolicitud,
  normalizarLecturaSolicitud,
  tipoArchivoDocSolicitud,
  ramoSolicitud,
  validarRespuestas,
  type CampoSolicitud,
  type ConocidoFicha,
  type DiscrepanciaSolicitud,
  type LecturaDocSolicitud,
  type RamoSolicitud,
  type Respuesta,
  type TipoCampo,
  type TipoDocSolicitud,
  type ValidacionSolicitud,
} from './solicitud-datos.ts'
export {
  EIAC_SITUACION_SINIESTRO,
  EIAC_ACCION_SINIESTRO,
  EIAC_SITUACION_ACCION,
  EIAC_FIGURA_ACCION,
  EIAC_POSICION_SINIESTRO,
  importeEiacNumero,
  leerClaveEiac,
  textoClave,
  tramitacionCompania,
} from './siniestro-tramitacion.ts'
export type {
  ClaveLeida,
  PasoTramitacionCorredor,
  TramitacionCompania,
  TramitacionCruda,
} from './siniestro-tramitacion.ts'
export {
  CAMPOS_CIMA,
  ROTULO_CAMPO_CIMA,
  claveNombre,
  mismoNombre,
  nombrePropio,
  sinFormatoNombre,
  fechaCima,
  claveTelefono,
  compararConCima,
  esPolizaDeCoche,
  huellaDecisionCima,
  esCampoCima,
  fechaIsoFlexible,
  mismoValorNormalizado,
  motivoCopiadoCima,
  type CampoCima,
  type FichaParaCima,
  type DatosCima,
  type DiferenciaCima,
} from './sincro-cima.ts'
export {
  GRUPOS_FUSION,
  ETIQUETA_GRUPO_FUSION,
  compararFichas,
  identidadFusion,
  dniIlegibleSinIndice,
  revisarElecciones,
  GRUPOS_IDENTIDAD_FUSION,
  identidadSinDecidir,
  type GrupoFusion,
  type ValorFusion,
  type EstadoCampoFusion,
  type CampoFusion,
  type IdentidadFusion,
  type DniFusion,
  type RevisionElecciones,
} from './fusion-fichas.ts'
export { claveCompania, claveMatricula, claveNumeroPoliza, mismaCompania, mismoSeguro, type SeguroOportunidad } from './compania-oportunidad.ts'
export {
  CATALOGO_GARANTIAS,
  GARANTIAS_DE_LEY,
  esGarantiaDeLey,
  etiquetasGarantiasDeLey,
  VERSION_CATALOGO,
  asistenciaAmpliada,
  asistenciaHogarAmpliada,
  descuentosDeOpciones,
  type DescuentoComercial,
  garantiasDeOpciones,
  type OpcionProductoLegible,
  claveCobertura,
  clasificarCoberturas,
  esTodoRiesgo,
  type ContextoGarantias,
  noReconocidas,
  nombresNuevosSinCatalogo,
  FUERA_DE_CATALOGO,
  ramoDeCatalogo,
  subcoberturas,
  type CoberturaParaClasificar,
  type EstadoGarantia,
  type GarantiaCatalogo,
  type GarantiasClasificadas,
  type RamoGarantias,
} from './catalogo-garantias.ts'
export { diferenciasDeOpcion, estadoDe, filtrarPorGarantias, type DiferenciasOpcion, interruptoresGarantias, preseleccionFija, GARANTIAS_PRESELECCIONADAS, type InterruptorGarantia, type OpcionFiltrable, type ResultadoFiltro } from './filtro-garantias.ts'
export {
  garantiasDeNecesidades,
  capitalServicio,
  cambiosFrenteActual,
  seguimientoPendiente,
  HORAS_SIN_ABRIR,
  HORAS_SIN_ELEGIR,
  type CambiosFrenteActual,
  type EtapaSeguimiento,
  type PresupuestoParaSeguimiento,
} from './presupuesto-ayudas.ts'

export {
  leerCorreoDevolucion,
  MOTIVO_POLIZA_ANULADA,
  clasificarMotivoDevolucion,
  normalizarIdRecibo,
  type DevolucionLeida,
  type LecturaCorreoDevolucion,
  type CorreoDevolucion,
  type TipoMotivoDevolucion,
} from './devolucion-correo.ts'

export {
  ORIGEN_DEVOLUCION,
  PREFIJO_TAREA_DEVOLUCION,
  HITOS_DEVOLUCION,
  hitoDevolucion,
  fechaEs,
  suspensionDesde,
  textoTareaDevolucion,
  type HitoDevolucion,
  type EntradaTareaDevolucion,
} from './seguimiento-devolucion.ts'
// Las figuras de una póliza de motor que no son el tomador: quién, con qué rol, y qué lead se reutiliza (03/10/2026).
export {
  ANIOS_CONDUCTOR_NOVEL,
  DETALLE_ROL_FIGURA,
  EDAD_CONDUCTOR_JOVEN,
  MAX_FIGURAS,
  NOTA_CONDUCTOR_JOVEN_NOVEL,
  ROLES_FIGURA_LEIDOS,
  CAMPOS_FIGURA,
  accionFiguraSinNombre,
  conductoresDelPlan,
  contactoSoloDelTomador,
  detalleRelacionFigura,
  esOtraPersona,
  esPersonaDeContacto,
  faltaDniOCarne,
  figurasSinNombre,
  hayConductorJovenONovel,
  leadSinDniReutilizable,
  normalizarFigurasLeidas,
  notaFiguraSinNombre,
  parcheFigura,
  planFiguras,
  tareaPedirDniYCarne,
  type CampoFigura,
  type CamposFigura,
  type CandidatoLeadSinDni,
  type DomicilioFigura,
  type FiguraLeida,
  type FiguraSinNombre,
  type LecturaFiguras,
  type ParcheFigura,
  type PersonaFigura,
  type PlanFiguras,
  type RolFiguraLeido,
  type TomadorFiguras,
} from './figuras-poliza.ts'
export { ROLES_FIGURA, ETIQUETA_ROL, rolesDelRamo, esRolFigura, limpiarFiguras, diferenciasVariante, resumenDiferencias, type RolFigura, type FigurasVariante, type Diferencia } from './variantes-riesgo.ts'

export { ibanValido, normalizarIban } from './iban.ts'
export { conMarcaCorreo, LOGO_CORREO_URL, PIE_MARCA_CORREO } from './correo-marca.ts'
export {
  CAMPOS_ANIOS_VENDOR, HISTORIAL_MAXIMO, aniosDelCuerpo, aplicarTopesHistorial, topesDelMensaje,
} from './historial-maximo.ts'
export type { CampoAniosVendor, TopesHistorial } from './historial-maximo.ts'

// Regla única de las oportunidades: aviso a Alberto 45 días antes del vencimiento (29/09/2026).
export {
  DIAS_AVISO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD_ABIERTA,
  avisosOportunidadDeHoy, claveAvisoOportunidad, diaMesEs, fechaAvisoOportunidad, fechaVencimientoDudosa, MESES_VENCIMIENTO_MAX, planLlamadaAnual, planTareaTrasVencimiento, vencimientoDelCiclo,
} from './oportunidad-aviso.ts'
export type { AvisoOportunidad, EstadoAvisoVencimiento, FechaDudosa, OportunidadParaAviso, PlanLlamadaAnual, PlanTareaVencimiento } from './oportunidad-aviso.ts'
export { estadoAvisoVencimiento } from './oportunidad-aviso.ts'
export {
  CANALES_FINANCIERA,
  ahorroFrenteActual,
  esCanalFinanciera,
  esMismaCompaniaQueLaActual,
  objetivoPrioritario,
  periodoEnAnios,
  periodoEnMeses,
  primaActualAnualizada,
} from './competencia-poliza.ts'
export type { AhorroFrenteActual, MotivoPrioritario, ObjetivoPrioritario, PrimaAnualizada } from './competencia-poliza.ts'
export { costePack, cuadroPack, decidirFamiliaAllianz, tienePolizaAllianzEnVigor } from './pack-vehiculos.ts'
export type { CuadroPack, DecisionFamiliaAllianz, FilaPack, LadoPack, PolizaParaFamilia, PrecioPack } from './pack-vehiculos.ts'
export {
  CAMPOS_VEHICULO, CILINDRADA_MAXIMA_CC, ETIQUETA_CAMPO_VEHICULO, TIPOS_VEHICULO, admiteDatosVehiculo, aplicarEdicionVehiculo, datosVehiculoDeCotizacion, datosVehiculoDeInfoRiesgo,
  datosVehiculoVacios, faltanDatosVehiculo, fusionarInfoRiesgo, hoyMadridVehiculo, incoherenciaFechasVehiculo,
  leerDatosVehiculo, motivoNoConfirmable, textoFaltanVehiculo, tipoVehiculoDeTexto, validarDatosVehiculoRiesgo,
} from './datos-vehiculo-riesgo.ts'
export type { CambioVehiculo, CampoVehiculo, DatosVehiculoRiesgo, ErrorVehiculo, TipoVehiculo, ValidacionVehiculo } from './datos-vehiculo-riesgo.ts'
export { SIN_IDS_CATALOGO, datosVehiculoDeDocumento } from './datos-vehiculo-documento.ts'
export type { IdsCatalogoVehiculo, VehiculoLeido } from './datos-vehiculo-documento.ts'

// Datos del riesgo por ramo (30/09/2026): vivienda, capital y riesgo libre, con el mismo patrón que el vehículo.
export {
  anioTope, aplicarEdicionBloque, leerBloque, numeroDesdeTexto, soloLoQueCambia, validarParcial, vaciosDe,
} from './datos-riesgo-generico.ts'
export type { CambioCampo, ErrorCampo, Espec, EspecCampo, TipoCampoRiesgo, ValorCampo } from './datos-riesgo-generico.ts'
export {
  CAMPOS_VIVIENDA, CATALOGO_HOGAR_DE_CAMPO, ESPEC_VIVIENDA, busquedaCatastroDeVivienda, ETIQUETA_CAMPO_VIVIENDA, admiteDatosVivienda, aplicarEdicionVivienda,
  datosViviendaDeCotizacion, datosViviendaVacios, faltanDatosVivienda, incoherenciaVivienda, inicialesHogarDeRiesgo,
  leerDatosVivienda, motivoNoConfirmableVivienda, precargaViviendaDePoliza, textoFaltanVivienda, validarDatosViviendaRiesgo,
} from './datos-vivienda-riesgo.ts'
export type { CampoCatalogoVivienda, CampoVivienda, DatosViviendaRiesgo, ValidacionVivienda } from './datos-vivienda-riesgo.ts'
export {
  CAMPOS_CAPITAL, ESPEC_CAPITAL, ETIQUETA_CAMPO_CAPITAL, MAX_ASEGURADOS, admiteDatosCapital, aplicarEdicionCapital, camposCapitalDelRamo,
  datosCapitalDeCotizacion, datosCapitalVacios, faltanDatosCapital, leerDatosCapital, motivoNoConfirmableCapital,
  textoAseguradosAdicionales, textoFaltanCapital, validarAseguradosAdicionales, validarDatosCapitalRiesgo,
} from './datos-capital-riesgo.ts'
export type { AseguradoAdicional, CampoCapital, DatosCapitalRiesgo, RamoCapital, ValidacionCapital, ValorEdicionCapital } from './datos-capital-riesgo.ts'
export {
  AVISO_RIESGO_LIBRE, CAMPOS_LIBRE, ESPEC_LIBRE, ETIQUETA_CAMPO_LIBRE, admiteDatosRiesgoLibre, aplicarEdicionLibre,
  datosRiesgoLibreVacios, faltanDatosRiesgoLibre, leerDatosRiesgoLibre, motivoNoConfirmableLibre, precargaLibreDePoliza,
  validarDatosRiesgoLibre,
} from './datos-riesgo-libre.ts'
export type { CampoRiesgoLibre, DatosRiesgoLibre, ValidacionLibre } from './datos-riesgo-libre.ts'
export {
  AVISO_COMERCIO, BIENES_COMERCIO, CAMPOS_COMERCIO, COMPANIAS_COMERCIO, ESPEC_COMERCIO, ESPEC_OCCIDENT, ESPEC_POR_COMPANIA, ESPEC_REALE, ETIQUETA_COMPANIA_COMERCIO, ETIQUETA_BIEN_COMERCIO, ETIQUETA_CAMPO_COMERCIO, ETIQUETA_REGIMEN_LOCAL,
  MAX_CAPITALES_COMERCIO, MAX_MEDIDAS_COMERCIO, REGIMENES_LOCAL, admiteDatosComercio, aplicarEdicionComercio, datosComercioVacios,
  faltanDatosComercio, leerDatosComercio, motivoNoConfirmableComercio, precargaComercioDePoliza, textoCapitalesComercio,
  textoFaltanComercio, textoMedidasComercio, validarCapitalesComercio, validarDatosComercioRiesgo, validarMedidasComercio, validarPorCompania,
} from './datos-comercio-riesgo.ts'
export type {
  BienComercio, BloqueCompania, CampoComercio, CampoFaltaComercio, CapitalComercio, CompaniaComercio, DatosComercioRiesgo, EdicionPorCompania,
  MedidaComercio, PorCompaniaComercio, RegimenLocal,
  ValidacionComercio, ValorEdicionComercio,
} from './datos-comercio-riesgo.ts'
export {
  CLAVES_DATOS_RIESGO, calcularEdicionRiesgo, claveDatosDeRamo, esClaveDatosRiesgo, fusionarInfoRiesgoClave,
  leerBloqueDeRamo, precargaDePoliza, ramoTarificable,
} from './datos-riesgo-ramo.ts'
export type { BloqueDatos, CambioRiesgo, ClaveDatosRiesgo, ResultadoEdicionRiesgo } from './datos-riesgo-ramo.ts'

// Imputar el bonus del conductor a un vehículo NUEVO desde sus otras pólizas de motor (03/10/2026).
export {
  elegirSeguroAnteriorParaImputar,
  historialParaImputar,
  maximoAniosSinSiniestros,
  aniosCompletos,
  aniosAseguradoAcreditados,
  origenesHistorialManual,
  candidataPublica,
  decidirBloqueoBonus,
  verificacionBonusDe,
  codigoDgsPorNombre,
  FUENTES_VERIFICACION_BONUS,
} from './imputar-seguro-anterior.ts'
export type {
  TipoVehiculoNuevo,
  TipoVehiculoCandidata,
  OrigenCandidata,
  CandidataSeguroAnterior,
  CandidataEvaluada,
  CandidataPublica,
  FaltaDeclarar,
  ImputacionSeguroAnterior,
  ErrorImputacion,
  HistorialImputado,
  CampoHistorial,
  FuenteVerificacionBonus,
  VerificacionBonus,
  BloqueoBonus,
} from './imputar-seguro-anterior.ts'

export { personaDeFicha, esTelefonoComodin } from './persona-ficha.ts'
export { esCanalCorreduria } from './canal-correduria.ts'
export {
  marcaAcreditaFicha,
  propuestaIdentidadDesdePoliza,
  capitalizarNombre,
  normalizarParaComparar,
  enmascararFecha,
  textoCambioIdentidadConMotivo,
  type MarcaIdentidadDocumento,
  type PropuestaIdentidad,
  type MotivoPropuesta,
} from './identidad-documentada.ts'
export { polizaAnteriorParaTarificar, CODIGOS_DGS_MAPFRE } from './poliza-anterior.ts'
export { aE164, esMovilWhatsapp } from './telefono-e164.ts'
export { telefonoParaFicha, formasHashTelefono } from './whatsapp-telefono.ts'
export { redactarPii, type OpcionesRedaccion } from './redactar-pii.ts'

export {
  TAXONOMIA_POR_RAMO, ramoOfertaDe, garantiasDelRamo, garantiaCanonica, normalizarGarantia, normalizarTexto,
} from './coberturas-taxonomia.ts'
export type { RamoOferta, GrupoGarantia, TipoValorGarantia, GarantiaCanonica } from './coberturas-taxonomia.ts'
export { compararOfertas, cifrasDeMatriz, UMBRAL_CONTINENTE_EUR_M2 } from './comparar-ofertas.ts'
export type {
  OfertaNormalizada, ValorGarantia, ResultadoComparacion, FilaMatriz, CeldaMatriz, ResumenOferta, AlertaInfraseguro,
} from './comparar-ofertas.ts'

// Acuerdos con compañías (comisión por ramo, rappel, clave de mediador) — 06/10/2026.
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
export {
  FUENTES_ACUERDO,
  ESTADOS_CLAVE,
  CANALES_CLAVE,
  TIPOS_OBJETIVO,
  AMBITOS_OBJETIVO,
  BASES_OBJETIVO,
  CRITERIOS_COBRO,
  deLista,
  leerPct,
  leerTramos,
  normalizarCodigoCima,
  atribuirClave,
  conflictosCodigos,
  lineaAplicable,
  ramoDesdeTexto,
  leerSeedAcuerdos,
} from './acuerdos.ts'
export type {
  FuenteAcuerdo,
  EstadoClave,
  CanalClave,
  TipoObjetivo,
  AmbitoObjetivo,
  BaseObjetivo,
  CriterioCobro,
  RamoAcuerdo,
  LecturaPct,
  Tramo,
  LecturaTramos,
  ClaveParaAtribuir,
  Atribucion,
  ConflictoCodigo,
  LineaAcuerdo,
  AcuerdoParaCalculo,
  ConsultaLinea,
  Candidata,
  LineaAplicable,
  SeedComision,
  SeedObjetivo,
  SeedAcuerdo,
  LecturaSeed,
} from './acuerdos.ts'

// Productividad por compañía frente a los acuerdos (fase 2, 06/10/2026).
export {
  produccionPorCompania,
  evaluarObjetivo,
  esCodigoProducto,
  TEXTO_PENDIENTE,
  DIAS_MINIMOS_PROYECCION,
  DIAS_ALERTA,
} from './acuerdos-productividad.ts'
export type {
  ReciboProduccion,
  Suma,
  ProduccionCompania,
  MotivoPendiente,
  ColorObjetivo,
  EstadoObjetivo,
  ObjetivoParaEvaluar,
} from './acuerdos-productividad.ts'

// Panel de control de Compañías: cartera en vigor × acuerdos (07/10/2026).
export {
  agregarCarteraVigor,
  totalesPorCompania,
  panelControl,
  MARGEN_COMISION_PUNTOS,
} from './acuerdos-control.ts'
export type {
  PolizaVigor,
  FilaCartera,
  TotalCartera,
  AcuerdoControl,
  ObjetivoEvaluadoControl,
  EstadoObjetivoControl,
  ObjetivoCandidata,
  CandidataRamo,
  RamoControl,
  PanelControl,
} from './acuerdos-control.ts'
export {
  figurasDePeticion, identidadPersona, nombresParaEtiquetas, etiquetaEscenario, seguroAnteriorDePeticion, textoSeguroAnterior,
  coberturasClave, ordenarEscenarios, mensajePropuestaWhatsapp, correoPropuesta, MAX_COBERTURAS_CLAVE,
  type PersonaEscenario, type FigurasEscenario, type SeguroAnteriorEscenario, type OpcionEscenario, type EscenarioEntrada,
  type EscenarioOrdenado, type DatosAvisoPropuesta, type DatosWhatsappPropuesta,
} from './propuesta-escenarios.ts'
