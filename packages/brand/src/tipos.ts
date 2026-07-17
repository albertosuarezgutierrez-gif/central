// Contrato de marca de la casa de marcas. Un cliente/tenant = un objeto `Marca`.
// La app no pinta colores a mano: consume estas variables vía @central/brand.

export interface PaletaMarca {
  /** Color de marca DOMINANTE (p. ej. el verde de Joaquín Jaén). */
  primario: string
  /** Variante oscura del primario, para hover y texto sobre claro. */
  primarioInk: string
  /** Fondo tenue del primario (rgba con alfa bajo), para chips/estados activos. */
  primarioSuave: string
  /** Color de ACENTO decorativo (p. ej. el oro/bronce): filetes, bordes, monograma. */
  acento: string
  acentoInk: string
  acentoSuave: string
  /** Fondo de página. */
  fondo: string
  /** Fondo alterno (secciones). */
  fondo2: string
  /** Fondo de tarjeta/panel. */
  panel: string
  panel2: string
  borde: string
  bordeSuave: string
  /** Texto principal. */
  texto: string
  /** Texto atenuado (labels). */
  textoTenue: string
  textoTenue2: string
  ok: string
  warn: string
  peligro: string
}

export interface TipografiaMarca {
  /** Familia para títulos/display (stack CSS completo con fallbacks). */
  titulos: string
  /** Familia para el cuerpo. */
  cuerpo: string
  /** Enlace opcional a Google Fonts (se inyecta en <head> por el cliente). */
  googleFontsHref?: string
}

export interface LogosMarca {
  /** Texto de marca (wordmark) por si no hay logo gráfico o como respaldo. */
  wordmark: string
  /** Ruta pública o data-URI del monograma (opcional). */
  monograma?: string
  /** Ruta pública o data-URI del lockup completo (opcional). */
  lockup?: string
}

export interface Marca {
  id: string
  nombre: string
  paleta: PaletaMarca
  tipografia: TipografiaMarca
  logos: LogosMarca
  /** Radio base de esquinas (p. ej. '14px'). */
  radio: string
}
