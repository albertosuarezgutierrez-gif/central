// ────────────────────────────────────────────────────────────────────────────
// Contratos del motor de underwriting inmobiliario (VUT). Sin lógica: solo tipos
// y las constantes pre-registradas del veredicto.
//
// 🚨 Regla que atraviesa TODO este módulo (CLAUDE.md, «Dato que NO hay ≠ dato que
// NO se ha mirado»): `null` = no se ha medido · `0`/`[]` = medido y no hay · un
// número = el dato. Ningún `?? 0` puede convertir un «no lo sé» en un «no hay»,
// porque estos números son sobre los que Alberto decide si compra.
// ────────────────────────────────────────────────────────────────────────────

/** Versión del motor. Se guarda con cada análisis para poder re-derivarlo después. */
export const MOTOR_VERSION = '1.0.0'

/** Comisión efectiva de Booking medida sobre la facturación de los pisos (SIVRA). */
export const COMISION_BOOKING = 0.1972

/**
 * Umbral pre-registrado del veredicto. Se fija ANTES de mirar ningún inmueble,
 * igual que los umbrales del pre-registro de trading: si se elige después de ver
 * el resultado, el umbral no filtra nada.
 */
export const UMBRAL_YIELD_NETO = 0.055

/**
 * Prima que un ladrillo tiene que batir a la alternativa líquida para compensar
 * que no se vende en un día. Sin ella, cualquier yield que empate con la bolsa
 * parecería suficiente.
 */
export const PRIMA_ILIQUIDEZ = 0.02

/**
 * Fracción del año que hace falta tener MEDIDA para que el veredicto valga algo.
 * Con menos, el ingreso anual es un suelo tan bajo que decidir con él es decidir
 * con otra cosa. En un mercado de playa, además, los meses que faltan suelen ser
 * justo los que mandan.
 */
export const UMBRAL_COBERTURA = 0.75

/** Una unidad explotable dentro del inmueble (para el escenario segregado). */
export interface Unidad {
  nombre: string
  plazas: number
}

export interface FichaInmueble {
  /** URL del anuncio o referencia catastral: lo que identifique al inmueble. */
  referencia: string
  municipio: string
  /** € pedidos. `null` = el anuncio aún no se ha leído. */
  precio: number | null
  /** m² construidos. `null` = no consta. */
  m2: number | null
  /** Plazas del inmueble explotado ENTERO. `null` = no consta. */
  plazasTotales: number | null
  /** Cómo quedaría segregado. Lista vacía = no evaluado. */
  unidades: Unidad[]
  /** Presupuesto de reforma. `null` = sin evaluar · `0` = evaluado, no hace falta. */
  reforma: number | null
  /** ITP + notaría + registro como fracción del precio (Andalucía ≈ 0,07 + gastos). */
  gastosCompraPct: number
}

/** `sin_verificar` NO es `no_tiene`: uno es un hueco, el otro una ausencia comprobada. */
export type EstadoLicencia = 'confirmada' | 'no_tiene' | 'sin_verificar'

export interface PuertaLegal {
  licenciaVUT: EstadoLicencia
  /**
   * Número de Registro Único de alquiler de corta duración. Sin él, ni Booking ni
   * Airbnb publican el anuncio: no es un ajuste del yield, es un sí/no previo.
   */
  registroUnico: EstadoLicencia
  /**
   * ¿Se compra el edificio ENTERO? Sin comunidad de propietarios no hay veto de los
   * 3/5 de la LPH (ver BOE-A-2026-5827, caso de Conil). `null` = no se sabe.
   */
  edificioCompleto: boolean | null
  notas: string[]
}

/** Un mes de la curva de temporada. */
export interface MesMercado {
  /** 1..12 */
  mes: number
  /** ADR mediano por noche que paga el HUÉSPED. `null` = no medido. */
  adrGuest: number | null
  /** Comparables que respondieron con precio. `0` = medido y no había. */
  comparables: number
  /**
   * Proxy de ocupación (0..1) por saturación de comparables. `null` = no medido.
   * 🚨 Booking da precio y disponibilidad, NO ocupación: esto es una estimación y
   * se etiqueta como tal en toda la cadena, incluida la pantalla.
   */
  ocupacionProxy: number | null
}

export interface Costes {
  /** Comisión del canal sobre el precio guest. */
  comisionCanal: number
  /** Gestión externa como fracción del ingreso (Conil está a 1h45 de Sevilla). */
  gestionPct: number
  limpiezaPorEstancia: number
  /** Noches medias por estancia: convierte noches vendidas en nº de limpiezas. */
  nochesPorEstancia: number
  ibiAnual: number
  seguroAnual: number
  suministrosAnual: number
  comunidadAnual: number
  /** Mantenimiento y reposición como fracción del ingreso bruto. */
  mantenimientoPct: number
}

export interface Financiacion {
  /** Fracción del precio financiada (0..1). */
  porcentaje: number
  /** Tipo nominal anual (0,03 = 3%). */
  tipoInteres: number
  anios: number
}

export interface Supuestos {
  /**
   * Ocupación a usar en los meses SIN proxy medido. `null` = no se asume nada, y
   * esos meses quedan fuera del cálculo declarándolo.
   */
  ocupacionPorDefecto: number | null
  /**
   * Descuento sobre el ingreso del año 1 por entrar con cero reseñas frente a
   * vecinos consolidados. Es un coste real de arranque, no una sorpresa de agosto.
   */
  rampaAnio1: number
  aniosHorizonte: number
  /** Rentabilidad anual de la alternativa líquida (bolsa) para el coste de oportunidad. */
  alternativaLiquida: number
  /** Alquiler de larga duración del inmueble entero, al mes. `null` = no comparado. */
  largaDuracionMensual: number | null
  /** Revalorización anual supuesta del inmueble, para el valor de salida. */
  revalorizacionAnual: number
  /**
   * € al año que se recuperarían quitándole a Booking su comisión en los pisos que
   * YA se tienen. `null` = no calculado. No es una rentabilidad sobre esta compra
   * —no hace falta invertir nada para conseguirla— y por eso se compara aparte.
   */
  comisionRecuperableAnual: number | null
}

export interface DesgloseCostes {
  comisionCanal: number
  gestion: number
  limpieza: number
  ibi: number
  seguro: number
  suministros: number
  comunidad: number
  mantenimiento: number
  total: number
}

export interface Escenario {
  nombre: 'entero' | 'segregado'
  plazas: number
  /** Unidades explotadas en este escenario. */
  unidades: number
  nochesVendidas: number
  ingresoBrutoAnual: number
  costes: DesgloseCostes
  /** Net Operating Income: ingreso bruto menos costes de explotación, antes de deuda. */
  noi: number
  yieldBruto: number
  yieldNeto: number
  /** `null` si no hay financiación declarada (no es 0: es que no aplica). */
  cashOnCash: number | null
  /** Años en recuperar el capital aportado. `null` si el flujo anual no es positivo. */
  paybackAnios: number | null
  /** TIR a `aniosHorizonte` incluyendo la venta final. `null` si no converge. */
  tir: number | null
  /** Meses cuya ocupación se supuso porque no había proxy medido. */
  mesesConOcupacionSupuesta: number[]
  /** Meses sin ADR medido, que no aportan ingreso al cálculo. */
  mesesSinMedir: number[]
  /** Meses con ADR pero sin ocupación (ni medida ni supuesta): tampoco aportan. */
  mesesSinOcupacion: number[]
  /** Fracción del año efectivamente calculada (0..1). */
  cobertura: number
  /**
   * `true` mientras la cobertura no sea del año entero: los meses que faltan solo
   * pueden SUMAR ingreso, así que lo calculado es un SUELO, no una estimación
   * centrada. Decirlo importa: un suelo que ya supera el umbral es una buena
   * noticia; un suelo que no llega no demuestra nada.
   */
  esSuelo: boolean
}

export type Decision = 'no_calculable' | 'no' | 'condicional' | 'si'

export interface Alternativa {
  nombre: string
  /** Rentabilidad anual comparable. `null` = no se pudo comparar. */
  rentabilidad: number | null
  nota: string
}

export interface Veredicto {
  decision: Decision
  /** Qué datos faltan para poder decidir. Vacío si no falta ninguno. */
  faltan: string[]
  motivos: string[]
  alternativas: Alternativa[]
  /** La mejor alternativa batible, ya con la prima de iliquidez sumada. */
  listonAnual: number | null
}

export interface Underwriting {
  motorVersion: string
  legal: PuertaLegal
  /** `null` si falta el precio o los m². */
  precioPorM2: number | null
  inversionTotal: number | null
  capitalAportado: number | null
  /** `null` cuando la puerta legal o los datos no permiten calcular. */
  escenarios: Escenario[] | null
  recomendado: 'entero' | 'segregado' | null
  veredicto: Veredicto
}
