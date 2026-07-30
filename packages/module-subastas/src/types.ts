// ────────────────────────────────────────────────────────────────────────────
// Tipos del módulo de subastas de inmuebles. Contrato ÚNICO al que normalizan
// TODOS los adaptadores de fuente (BOE, PLACSP, BOP, Junta, Sareb, servicers),
// para que scoring/radar/avisos/UI no sepan de dónde viene cada anuncio.
// Puro: sin red, sin BD, sin secretos.
// ────────────────────────────────────────────────────────────────────────────

/** De dónde vino el anuncio. Añadir una fuente = añadir un adaptador, nada más. */
export type Fuente =
  | 'boe'        // Portal de Subastas del BOE (judicial, notarial, AEAT, TGSS)
  | 'placsp'     // Plataforma de Contratación: enajenaciones de ayuntamientos/diputaciones
  | 'bop'        // Boletines Oficiales de Provincia (subastas municipales)
  | 'junta'      // D.G. de Patrimonio de la Junta de Andalucía
  | 'sareb'      // Canal de subastas electrónicas de Sareb
  | 'servicer'   // Servihabitat, Aliseda, Solvia, Haya, Altamira, Diglo…

/**
 * Naturaleza de la operación. `venta_adjudicado` NO es una subasta: es venta
 * directa de stock adjudicado a un banco/fondo (servicers, Sareb). Se modela
 * aquí a propósito porque la intención de compra es la misma, pero el scoring
 * la trata distinto (no hay depósito ni fecha de cierre).
 */
export type TipoSubasta =
  | 'judicial'
  | 'notarial'
  | 'agencia_tributaria'
  | 'seguridad_social'
  | 'administrativa'
  | 'concursal'
  | 'venta_adjudicado'
  | 'otra'

/**
 * Situación posesoria del inmueble. Es el mayor riesgo de una subasta: un piso
 * ocupado puede tardar años en desalojarse. `desconocida` = el anuncio no dice
 * nada, que NO es lo mismo que `libre`.
 */
export type SituacionPosesoria = 'libre' | 'ocupada' | 'ocupada_desconocida' | 'desconocida'

/** Naturaleza del ejecutado: decide si la adjudicación va por ITP o por IVA+AJD. */
export type Ejecutado = 'fisica' | 'juridica' | 'desconocido'

/** Un inmueble en subasta, ya normalizado desde cualquier fuente. */
export interface SubastaInmueble {
  /** Clave estable de deduplicación (identificador de la fuente). */
  dedupeKey: string
  fuente: Fuente
  /** Identificador oficial cuando existe: SUB-JA-2026-123456, BOE-B-2026-1234… */
  identificador?: string | null
  tipo: TipoSubasta
  /** Juzgado, notaría, organismo o servicer que gestiona. */
  autoridad?: string | null
  provincia?: string | null
  municipio?: string | null
  /** Dirección postal (Catastro si la hay; si no, la extraída del anuncio). */
  direccion?: string | null
  /** Coordenadas WGS84. Alimentan el mapa nacional y el enlace a Google Maps. */
  lat?: number | null
  lon?: number | null
  /** 'catastro' = parcela exacta · 'municipio' = centroide aproximado (OSM). */
  geoPrecision?: 'catastro' | 'municipio' | null
  descripcion?: string | null
  url?: string | null

  fechaInicio?: string | null
  /** Conclusión de la subasta. Alimenta el recordatorio de cierre. */
  fechaFin?: string | null

  /** Tipo de salida / valor de subasta. */
  valorSubasta?: number | null
  /** Tasación publicada. Sin ella no hay descuento calculable. */
  tasacion?: number | null
  pujaMinima?: number | null
  tramos?: number | null
  /** Depósito exigido para pujar. Si la fuente no lo da se deriva (5%). */
  deposito?: number | null

  /** Cargas ANTERIORES/preferentes que NO se cancelan con la adjudicación. */
  cargas?: number | null
  /** Texto literal de cargas; `null` + `cargasConocidas:false` = no publicadas. */
  cargasTexto?: string | null
  cargasConocidas?: boolean

  situacionPosesoria?: SituacionPosesoria
  ejecutado?: Ejecutado
  /** Cuota que se subasta. 100 = pleno dominio; <100 = proindiviso. */
  porcentajeSubastado?: number | null
  /** Si el anuncio advierte de que no hay acceso al interior. */
  sinVisita?: boolean

  /** Referencia catastral: llave para enriquecer y para deduplicar entre fuentes. */
  refCatastral?: string | null
  /** Superficie en m², del Catastro o del anuncio. */
  superficie?: number | null
  anioConstruccion?: number | null
  /** Valor de referencia del Catastro — base imponible del ITP desde 2022. */
  valorReferencia?: number | null
  /**
   * €/m² de mercado de la zona, calculado con los comparables de los portales
   * (`comparables.ts`). Es el ÚLTIMO recurso para estimar el valor: solo se usa
   * cuando no hay tasación ni valor de referencia, y siempre con aviso.
   */
  precioM2Mercado?: number | null
  /** Nº de anuncios que sostienen ese €/m². Menos muestra, menos fiabilidad. */
  muestraMercado?: number | null

  lotes?: number | null
}

/** Desglose del coste REAL de quedarse el inmueble ("puerta abierta"). */
export interface CosteAdquisicion {
  remate: number
  cargasPreferentes: number
  /** Impuesto de transmisión: ITP, o IVA+AJD si el ejecutado es persona jurídica. */
  impuestoTransmision: number
  /** Base sobre la que se ha calculado el impuesto (la trampa del valor de referencia). */
  baseImponible: number
  /** Etiqueta legible del impuesto aplicado, p.ej. "ITP 7% sobre valor de referencia". */
  impuestoConcepto: string
  notariaRegistro: number
  cancelacionCargas: number
  plusvaliaMunicipal: number
  comunidadPendiente: number
  ibiPendiente: number
  /** Coste estimado de recuperar la posesión si está ocupada. */
  lanzamiento: number
  total: number
  /** Avisos legibles sobre supuestos y estimaciones del cálculo. */
  avisos: string[]
}

/** Parámetros de coste, todos con default razonable y sobreescribibles. */
export interface ParamsCoste {
  /** Tipo de ITP en tanto por uno. Andalucía: 0.07 general. */
  tipoItp?: number
  /** Tipo de IVA en tanto por uno cuando el ejecutado es persona jurídica. */
  tipoIva?: number
  /** Actos Jurídicos Documentados, en tanto por uno. Andalucía: 0.012. */
  tipoAjd?: number
  notariaRegistro?: number
  cancelacionCargas?: number
  plusvaliaMunicipal?: number
  comunidadPendiente?: number
  ibiPendiente?: number
  lanzamiento?: number
}

/** Resultado de evaluar la oportunidad de una subasta. */
export interface Oportunidad {
  coste: CosteAdquisicion
  /** Valor de mercado con el que se compara (tasación, valor de referencia o comparables). */
  valorMercado: number | null
  /** De dónde salió `valorMercado`. `null` cuando no se pudo estimar. */
  origenValor: 'tasacion' | 'valor_referencia' | 'comparables' | null
  /** Descuento en tanto por uno sobre el valor de mercado. Negativo = sobrecoste. */
  descuento: number | null
  /** Lo que hay que consignar para poder pujar. */
  deposito: number | null
  /** 0-100. `null` cuando no hay datos para calcularlo — NUNCA se inventa. */
  puntuacion: number | null
  /** Factor de riesgo aplicado (1 = sin penalización). */
  factorRiesgo: number
  motivos: string[]
  avisos: string[]
}

/** Criterios de búsqueda de una cuenta. */
export interface CriteriosSubasta {
  provincias?: string[]
  palabrasClave?: string[]
  precioMin?: number
  precioMax?: number
  /** Descuento mínimo en % para que merezca aviso. */
  descuentoMin?: number
  excluirOcupadas?: boolean
  /** Tipos de operación aceptados. Vacío = todos. */
  tipos?: TipoSubasta[]
}

/** Veredicto de casar una subasta contra unos criterios. */
export interface CoincidenciaSubasta {
  casa: boolean
  puntuacion: number
  motivos: string[]
  /** Por qué se descartó, cuando `casa` es false. */
  descartadaPor?: string
}
