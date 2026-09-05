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
  /** Superficies de interacción (hover/activo). Opcional: si falta, la app usa las suyas. */
  superficies?: SuperficiesMarca
  /** Escala de elevación (sombras planas). Opcional. */
  elevacion?: ElevacionMarca
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
  /**
   * Tema oscuro. Si falta, la marca NO tiene tema oscuro y `emitirRootCss` no
   * emite su bloque — que es distinto de tener uno a medias.
   */
  paletaOscura?: PaletaOscuraMarca
  tipografia: TipografiaMarca
  logos: LogosMarca
  /** Radio base de esquinas (p. ej. '14px'). */
  radio: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Tema oscuro y sistema de superficies (05/09/2026)
//
// 🚨 Todo lo de aquí abajo es OPCIONAL a propósito. `MARCA_JOAQUIN_JAEN` no lo
// declara y tiene que seguir funcionando exactamente igual: una marca que no
// pide tema oscuro no lo tiene, y `emitirRootCss` no emite el bloque.
//
// De dónde salen estos conceptos: NO están inventados. Son los que usa la app
// de `app.grupoasegura.com` (Tailwind v4 + shadcn `base-nova`), leídos de su
// `globals.css`. Allí el color de marca vive aislado en cinco tokens y TODO lo
// demás es gris de croma 0; por eso aquí las superficies van separadas de la
// paleta de marca en vez de derivarse de ella.

/** Superficies de interacción: el fondo de un elemento al pasar por encima y al pulsarlo. */
export interface SuperficiesMarca {
  /** Fondo al pasar el ratón (filas de tabla, items de menú, pestañas). */
  hover: string
  /** Fondo mientras se pulsa / del elemento seleccionado. */
  activo: string
}

/**
 * Escala de elevación. Son sombras PLANAS —casi un borde— no las nubes grises
 * de Material: en claro, un anillo negro al 5%; en oscuro la sombra deja de
 * verse y lo que separa es un anillo BLANCO al 6-8%. Por eso son tres strings
 * y no un número: en oscuro no es la misma sombra más tenue, es otra cosa.
 */
export interface ElevacionMarca {
  /** Reposo: tarjetas y paneles. */
  panel: string
  /** Un dedo por encima: menús desplegables, popovers. */
  flotante: string
  /** Por encima de todo: diálogos, cajones. */
  encima: string
}

/**
 * La mitad de la paleta que cambia con el tema. Es `Partial` porque una marca
 * puede querer oscurecer solo las superficies y conservar su color de marca.
 *
 * ⚠️ Lo que NO se hereda: si una clave falta aquí, en oscuro se queda el valor
 * del tema claro. Eso es correcto para el primario (un azul de marca suele
 * valer en los dos) y es un error para un fondo. Al declarar una paleta oscura,
 * repasa que estén TODAS las superficies y todos los textos.
 */
export type PaletaOscuraMarca = Partial<PaletaMarca>
