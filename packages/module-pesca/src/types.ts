// PUERTOS de Trazabilidad pesquera. Modelan la recepción de género en una pescadería/mayorista
// (molde tomado de la reunión con Maricarmen de Mariscos González) y su re-envasado para venta.
// El módulo es PURO: no consulta BD, recibe estructuras ya normalizadas y devuelve derivados/validaciones.

/** Canal de venta. Determina si la etiqueta lleva el nº de lote (regla de la reunión). */
export type Canal = 'mostrador' | 'catering' | 'hotel'

/** Método de producción del Reglamento (UE) 1379/2013 para productos de la pesca. */
export type MetodoProduccion = 'capturado' | 'capturado_agua_dulce' | 'criado'

/**
 * Partida recibida = un lote de género tal y como ENTRA con su albarán. Es el ancla de la
 * trazabilidad: todo lo que se venda de aquí conserva su `loteOrigen`.
 */
export interface Partida {
  id: string
  /** Denominación comercial. P. ej. "Gamba blanca". */
  producto: string
  /** Nombre científico (obligatorio al consumidor en pesca). P. ej. "Parapenaeus longirostris". */
  nombreCientifico?: string | null
  /** Proveedor / lonja / empresa de los barcos. */
  proveedor?: string | null
  /** Nº de lote CON EL QUE ENTRA. Se conserva hasta la venta (el dolor de Maricarmen). */
  loteOrigen: string
  /** Nº de albarán del proveedor. */
  albaran?: string | null
  /** Marea: identificador de la salida de pesca. */
  marea?: string | null
  /** Barco que capturó el género. */
  barco?: string | null
  /** Zona de captura FAO / caladero (obligatorio al consumidor). */
  zonaCaptura?: string | null
  /** Arte de pesca (obligatorio al consumidor en capturado). P. ej. "Arrastre". */
  artePesca?: string | null
  metodoProduccion?: MetodoProduccion | null
  /** Fechas en ISO (YYYY-MM-DD). */
  fechaCaptura?: string | null
  fechaRecepcion: string
  fechaCaducidad?: string | null
  /** Calibre/tamaño. P. ej. "40/60". Condiciona el precio. */
  calibre?: string | null
  /** Peso recibido en kg (lo que entró en cámara). */
  pesoRecibidoKg: number
  /** € por kg de compra. */
  precioCompraKg?: number | null
  /** € por kg de venta (según calibre). */
  precioVentaKg?: number | null
  estado?: 'en_camara' | 'agotada'
  notas?: string | null
}

/** Unidad de venta re-envasada a partir de una Partida. HEREDA el lote de origen. */
export interface Envasado {
  id: string
  /** Partida de la que sale (ancla de trazabilidad). */
  partidaId: string
  canal: Canal
  /** Peso de este envase en kg (manual en Fase 1; báscula en Fase 2). */
  pesoKg: number
  /** € por kg aplicado (normalmente el `precioVentaKg` de la partida). */
  precioKg: number
  fechaEnvasado: string
  fechaCaducidad?: string | null
  /** Cliente destino (catering/hotel). */
  cliente?: string | null
  /** Código único del envase (para localizarlo). */
  codigo?: string | null
}

/** Datos de recepción para dar de alta una Partida (sin id/estado, aún no persistida). */
export type PartidaInput = Omit<Partida, 'id' | 'estado'> & { estado?: Partida['estado'] }

/** Datos para envasar (sin id). */
export type EnvasadoInput = Omit<Envasado, 'id'>

/**
 * Payload YA RESUELTO para pintar/imprimir una etiqueta. `lote` viene relleno SOLO si el canal
 * lo exige; en mostrador es null. La info pesquera al consumidor va siempre.
 */
export interface EtiquetaPayload {
  producto: string
  nombreCientifico: string | null
  canal: Canal
  /** Lote de origen SOLO si el canal lo exige (catering/hotel). null en mostrador. */
  lote: string | null
  metodoProduccion: MetodoProduccion | null
  zonaCaptura: string | null
  artePesca: string | null
  calibre: string | null
  pesoKg: number
  precioKg: number
  importe: number
  fechaEnvasado: string
  fechaCaducidad: string | null
  cliente: string | null
  codigo: string | null
  /** Trazabilidad interna (para catering/hotel): de dónde salió. */
  trazabilidad: {
    proveedor: string | null
    barco: string | null
    marea: string | null
    albaran: string | null
    fechaCaptura: string | null
  }
}
