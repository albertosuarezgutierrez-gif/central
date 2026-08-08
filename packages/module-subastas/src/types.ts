// ────────────────────────────────────────────────────────────────────────────
// Tipos del módulo de subastas de inmuebles. Contrato ÚNICO al que normalizan
// TODOS los adaptadores de fuente (BOE, PLACSP, BOP, Junta, Sareb, servicers),
// para que scoring/radar/avisos/UI no sepan de dónde viene cada anuncio.
// Puro: sin red, sin BD, sin secretos.
// ────────────────────────────────────────────────────────────────────────────

import type { TipoBien } from './extraccion.ts'
import type { ParamsFinanciacion } from './financiacion.ts'

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
  /**
   * Dirección tal cual la publica el ANUNCIO (descripción registral). Puede ser
   * prosa, no una dirección postal — cualquier uso debe pasarla por
   * `esDireccionPostal` antes de creérsela.
   */
  direccion?: string | null
  /**
   * `ldt` del CATASTRO, el dato oficial. Va aparte de `direccion` a propósito:
   * mezclarlos hacía que la ficha etiquetase «🏛️» un párrafo del edicto y que
   * el enlace al mapa mandase esa prosa a Google pisando el punto exacto
   * (31/07/2026). Se formatea con `direccionCatastro()`.
   */
  direccionCatastro?: string | null
  /** Coordenadas WGS84. Alimentan el mapa nacional y el enlace a Google Maps. */
  lat?: number | null
  lon?: number | null
  /** 'catastro' = parcela exacta · 'municipio' = centroide aproximado (OSM). */
  geoPrecision?: 'catastro' | 'municipio' | null
  codigoPostal?: string | null
  /** Uso principal según Catastro (Residencial, Comercial…). */
  usoCatastral?: string | null
  /** Superficie construida OFICIAL, distinta de la registral del anuncio. */
  superficieCatastro?: number | null
  descripcion?: string | null
  url?: string | null

  fechaInicio?: string | null
  /** Conclusión de la subasta. Alimenta el recordatorio de cierre. */
  fechaFin?: string | null

  /** Tipo de salida / valor de subasta. */
  valorSubasta?: number | null
  /** Tasación publicada. Sin ella no hay descuento calculable. */
  tasacion?: number | null
  /**
   * Puja mínima admisible. TRES estados: número = publicada · `0` = el portal
   * declara «Sin puja mínima» (revisado, no hay) · `null` = no publicada / sin
   * leer. NUNCA comprobar con truthiness (`if (s.pujaMinima)` confunde el 0 con
   * el null): siempre `!= null`.
   */
  pujaMinima?: number | null
  tramos?: number | null
  /** Depósito exigido para pujar. Si la fuente no lo da se deriva (5%). */
  deposito?: number | null
  /**
   * Mejor puja publicada por la ficha del portal en la última consulta (solo
   * se vigila en las SEGUIDAS cerca del cierre). `null` = no publicada o sin
   * consultar — que NO es «sin pujas»: el portal no siempre la enseña.
   */
  mejorPuja?: number | null

  /**
   * Cantidad reclamada en el procedimiento (principal + intereses + costas).
   * Es la deuda que se ejecuta: vía alternativa de aprobación del remate
   * (art. 670.4 LEC) y techo probable de la puja del ejecutante, que hasta ahí
   * puja sin desembolso real. NO es el valor por el que se puja (ese es
   * `valorSubasta`).
   */
  cantidadReclamada?: number | null

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
  /**
   * De dónde salió `superficie`. Va SIEMPRE con la cifra: los m² del Catastro y
   * los de la escritura discrepan a menudo (El Puerto de Santa María: 112 vs
   * 115,66) y quien mira la ficha necesita saber cuál está leyendo.
   */
  superficieOrigen?: 'catastro' | 'anuncio' | null
  /**
   * Los m² tal y como los da la descripción REGISTRAL, sin mezclar con los del
   * Catastro. `superficie` se queda con la mejor de las dos para todo lo demás;
   * esta se guarda aparte porque para VALORAR hay que poder compararlas (ver
   * `superficieValorable`): una referencia catastral de parcela devuelve los
   * metros del edificio, no los del piso que se subasta.
   */
  superficieRegistral?: number | null
  anioConstruccion?: number | null

  // ── Características físicas del inmueble ──────────────────────────────────
  // Lo que alguien mira ANTES que el precio: qué es y cómo es. Salen de la
  // descripción registral (`extraerDatos`) o de la ficha del Catastro.
  tipoBien?: TipoBien | null
  dormitorios?: number | null
  banos?: number | null
  /** Planta tal cual la publica el anuncio: «séptima», «baja», «2ª»… */
  planta?: string | null
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
  /**
   * Etiqueta de la zona de la que salió ese €/m² («Matalascañas»,
   * «SEVILLA · san-pablo-santa-justa», «SEVILLA (buscador Fotocasa)»). De ella
   * depende que la referencia sea utilizable o solo orientativa: la mediana de
   * una ciudad entera no describe a un piso concreto (ver `valoracion.ts`).
   */
  zonaMercado?: string | null

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
  /** Intereses + comisión del puente. 0 si no se declaró financiación. */
  costeFinanciacion: number
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
  /**
   * Deuda con la comunidad. Si va a 0 se ESTIMA por baremo (art. 9.1.e LPH),
   * salvo que `estimarComunidad` sea `false`.
   */
  comunidadPendiente?: number
  /** `false` desactiva la estimación automática de deuda de comunidad. */
  estimarComunidad?: boolean
  /** Años de impago conocidos (del juzgado/administrador), para afinar la estimación. */
  aniosImpagoComunidad?: number
  /** Cuota mensual REAL de comunidad si se conoce; manda sobre el baremo por m². */
  cuotaComunidadMensual?: number
  ibiPendiente?: number
  lanzamiento?: number
  /**
   * Cómo se financia el desembolso. Sin esto NO se computa coste del dinero:
   * suponer un puente que quizá no existe falsearía el coste.
   */
  financiacion?: ParamsFinanciacion
}

/** Resultado de evaluar la oportunidad de una subasta. */
export interface Oportunidad {
  coste: CosteAdquisicion
  /** Valor de mercado con el que se compara (tasación, valor de referencia o comparables). */
  valorMercado: number | null
  /** De dónde salió `valorMercado`. `null` cuando no se pudo estimar. */
  origenValor: 'tasacion' | 'valor_referencia' | 'comparables' | null
  /**
   * El valor SIN el descuento por estado: lo que valdría ya reformado. Es el
   * que mira la lente flip (que resta la reforma aparte); usarlo en cualquier
   * otro sitio sería contar dos veces la mejora.
   */
  valorMercadoReformado: number | null
  /**
   * `true` cuando el €/m² sale de una zona demasiado gruesa para describir a
   * este inmueble (la mediana de una ciudad entera). El valor se enseña, pero
   * no debe sostener un aviso ni un «flip apto».
   */
  valorOrientativo: boolean
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
