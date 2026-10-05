// Tipos del tarificador RPA (05/10/2026). PUROS: ni BD, ni red, ni Playwright.
//
// 🚨 Regla de la casa: `null` = «no se sabe / no figura», NUNCA «no hay» ni 0. Un riesgo sin
// ascensor declarado no es un riesgo «sin ascensor», y una oferta sin franquicia leída no es una
// oferta «sin franquicia».

/** Ramos que el canal RPA sabe tarificar. Se amplía cuando haya un adaptador de otro ramo. */
export type RamoRpa = 'comunidades'

/** Dirección del riesgo (la del EDIFICIO, no la del tomador). */
export type DireccionRiesgo = {
  /** ePAC Comunidades 2020 no pide la vía (solo CP/población): opcional. */
  via: string | null
  numero: string | null
  codigoPostal: string
  municipio: string | null
  provincia: string | null
}

/**
 * El riesgo de una comunidad de propietarios, con la forma del formulario real de Allianz ePAC
 * «Comunidades 2020» (captura del 05/10/2026). Los campos que ePAC marca con * los exige
 * `validarRiesgoComunidad` (en el TIPO siguen `| null` por compatibilidad con lo ya encolado);
 * el resto es opcional y `null`/ausente = «no se ha preguntado» (≠ 0, ≠ false).
 * Los selects de ePAC viajan como string LIBRE: TODO(valores admitidos) cuando Alberto pase las listas.
 */
export type RiesgoComunidad = {
  ramo: 'comunidades'
  /** Dirección del edificio. ePAC solo pide CP/población (lupa); la vía queda para la ficha. */
  direccion: DireccionRiesgo
  /** Referencia catastral del edificio. `null` = no consta. */
  referenciaCatastral?: string | null

  // ── DATOS ──
  /** «Póliza a Reemplazar» (opcional). */
  polizaAReemplazar?: string | null
  /** DNI/NIF/NIE/CIF del tomador (opcional) y su tipo (select; ejemplo visto: «Dispone NIF/CIF/NIE»; TODO valores admitidos). */
  documentoIdentidad?: string | null
  tipoDocumento?: string | null
  /** «Fecha Inicio *», ISO `AAAA-MM-DD` (= fecha de efecto). */
  fechaEfecto: string | null
  /** «Fecha Término *», ISO `AAAA-MM-DD`. Obligatoria. */
  fechaTermino?: string | null

  // ── DESCRIPCIÓN RIESGO ──
  /** «Metros Cuadrados *». */
  m2Construidos: number | null
  /** «Año Construcción *». */
  anioConstruccion: number | null
  /** «Año Reforma» (opcional). */
  anioRehabilitacion?: number | null
  /** «Tipo Vivienda *» (select). Ejemplo visto: «Viviendas Pisos en Alto». TODO(valores admitidos): no es catálogo cerrado. */
  tipoVivienda?: string | null
  /** «Uso *» (select). Ejemplo visto: «Habitual». TODO(valores admitidos). */
  uso?: string | null
  /** «Plantas sobre N. Calle *» (plantas SOBRE rasante). */
  plantas: number | null
  /** «Plantas bajo Nivel Calle» (opcional). */
  plantasBajoRasante?: number | null
  /** «Sótanos» (opcional). */
  sotanos?: number | null
  /** «Nº Edificios *». */
  numEdificios?: number | null
  /** «Contiguos» (select que se habilita con varios edificios; TODO valores admitidos). */
  contiguos?: string | null
  /**
   * «Nº Viv. y Locales *» es UN solo campo en ePAC. Se rellena con `numViviendasYLocales` o, si no
   * viene, con numViviendas + numLocales (solo cuando vienen los dos).
   */
  numViviendasYLocales?: number | null
  numViviendas: number | null
  numLocales: number | null
  numGarajes?: number | null
  /** «Lista Propietarios / Arrendatarios *» (select). Ejemplo visto: «> 50%». TODO(valores admitidos). */
  listaPropietarios?: string | null
  /** «Instalaciones Anexas (Deportivas, Piscinas, etc.)» (checkbox). `null` = no se marca. */
  instalacionesAnexas?: boolean | null

  // ── FORMA PAGO / COMISIÓN (selects; ejemplos vistos: «Bancario», comisión «A»; TODO valores admitidos) ──
  formaPagoPrimerRecibo?: string | null
  formaPagoSucesivos?: string | null
  comision?: string | null

  // ── PARTIDAS ASEGURABLES ──
  /** «Edificación Valor Reposición» (opcional en ePAC). */
  capitalContinente: number | null
  /** ePAC Comunidades 2020 no lo pide: se conserva por compatibilidad con lo encolado. */
  capitalContenido: number | null
  /** Checkboxes de asistencia. `null`/ausente = no se marca. */
  asistenciaPlagas?: boolean | null
  asesoramientoJuridico?: boolean | null
  impagoCuotas?: boolean | null
  ite?: boolean | null

  // ── Campos previos que ePAC Comunidades 2020 NO pide (compatibilidad, no se rellenan) ──
  ascensor: boolean | null
  piscina?: boolean | null
  zonasAjardinadas?: boolean | null
  calidadConstruccion?: 'normal' | 'alta' | 'lujo' | null
  siniestrosUltimos3Anios?: number | null
  companiaActual?: string | null
}

export type Fraccionamiento = 'anual' | 'semestral' | 'trimestral' | 'mensual'

/** Una cobertura tal como la da la compañía. Forma compatible con `ValorGarantia` del PR #4305. */
export type CoberturaOferta = {
  /** Clave canónica si se reconoce; si no, el texto literal de la compañía (nunca se inventa clave). */
  clave: string
  /** Texto literal del portal. */
  literal: string
  estado: 'incluida' | 'excluida' | null
  capital: number | null
  limite: number | null
  franquicia: number | null
}

export type FranquiciaOferta = {
  /** A qué se aplica (`general` o la clave/literal de la cobertura). */
  ambito: string
  importeEur: number | null
  /** Literal del portal cuando no es un importe fijo (p. ej. «10% del siniestro, mín. 150 €»). */
  literal: string | null
}

/** Referencia al PDF que el worker sube junto al resultado (en `pdfs[]` del POST, por índice). */
export type PdfRef = { indice: number; nombre: string }

/** La oferta de UNA compañía para UN producto, ya normalizada por el adaptador. */
export type OfertaNormalizada = {
  compania: string
  producto: string
  /** Prima ANUAL total (con impuestos) en euros. Una oferta sin prima no es una oferta. */
  primaAnualEur: number
  /** Prima neta si el portal la separa. `null` = no la separa. */
  primaNetaEur: number | null
  fraccionamiento: Fraccionamiento | null
  /** Importe de cada recibo con ese fraccionamiento. `null` = el portal no lo dice. */
  importeReciboEur: number | null
  coberturas: CoberturaOferta[]
  franquicias: FranquiciaOferta[]
  /** Hasta cuándo vale la oferta (ISO `AAAA-MM-DD`). `null` = el portal no lo dice. */
  validaHasta: string | null
  /** Número de proyecto/oferta del portal (para volver a ella a mano). `null` = no lo da. */
  referenciaPortal: string | null
  pdf: PdfRef | null
  /** Avisos de la compañía (se enseñan SIEMPRE) y del adaptador (lo que supuso o no pudo leer). */
  avisos: string[]
}

/** Credenciales de UN portal, solo en memoria del worker (salen de fly secrets). */
export type Credenciales = { usuario: string; contrasena: string }

/** Lo que el runner le da al adaptador. Nada de BD ni de secretos ajenos a su portal. */
export type ContextoTarificacion = {
  trabajoId: string
  credenciales: Credenciales
  /** Log ya redactado (las credenciales no pueden salir aunque el adaptador se equivoque). */
  log: (mensaje: string) => void
  /** Pausa «humana» entre pasos (ms aleatorios dentro de la horquilla del runner). */
  pausa: () => Promise<void>
  /** El adaptador la llama al terminar el login: a partir de aquí el runner PUEDE activar tracing. */
  trasLogin: () => Promise<void>
  /** Registra un PDF descargado y devuelve su referencia para la oferta. */
  adjuntarPdf: (nombre: string, contenido: Uint8Array) => PdfRef
}

export type ResultadoAdaptador = { ofertas: OfertaNormalizada[] }

/**
 * Contrato de un adaptador de portal. `P` es la página del navegador (Playwright `Page` en el
 * worker) y `C` el contexto que el worker amplía (p. ej. con su `pulsar()` guardado); este paquete
 * no depende de Playwright a propósito.
 */
export interface TarificadorAdapter<P = unknown, R = RiesgoComunidad, C extends ContextoTarificacion = ContextoTarificacion> {
  readonly compania: string
  readonly ramo: RamoRpa
  tarificar(page: P, riesgo: R, ctx: C): Promise<ResultadoAdaptador>
}
