// lib/sivra/pricing-markup.ts — ¿el markup de canal que SUPONE el motor es el que ve el huésped?
//
// POR QUÉ (18/08/2026, reserva de House 21-25/12). El motor tarifica anclado al mercado: mide el
// precio GUEST de los comparables y lo convierte a precio BASE de Smoobu dividiendo por
// `pricing_settings.channel_markup`. Ese divisor es una SUPOSICIÓN sobre lo que Smoobu le suma al
// canal (el `priceDifference` de Booking) y nunca se había contrastado con la realidad. Si el
// markup configurado es MAYOR que el real, la cadena entera se desplaza hacia abajo:
//
//     base = mercado / 1,20   →   escaparate = base × 1,00   →   vendemos a 0,83 × mercado
//
// y encima en silencio, porque el motor cree que ha listado justo al mercado. Es exactamente el
// fallo del ÷1,16 que se corrigió el 09/08/2026 («un −14% sistemático»), con la diferencia de que
// ahora sí se puede MEDIR: la rutina de Booking se topa a diario con nuestro propio anuncio y ese
// precio —que como comparable se descarta (mercado-propios.ts)— es el escaparate.
//
// Medición inicial (18/08/2026, House Sevillana, 26-28/12 libre): base 1.393,50€/noche, escaparate
// 1.531,80€ con 12 huéspedes (×1,10) y 1.384,62€ con 6 o menos (×0,99). Configurado: 1,20.
//
// 🚨 El aforo NO es un detalle: Booking recarga por persona a partir de cierto umbral (medido ese
// día: +24,53€/persona/noche por encima de 6). Comparar un escaparate de 4 huéspedes contra la
// base sería medir el recargo, no el markup. Por eso solo cuentan las muestras del aforo MÁXIMO,
// que es el mismo con el que se miden los comparables del piso.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Una medición del escaparate: lo que el portal pedía por esa noche, y nuestra base de ese día. */
export interface MuestraEscaparate {
  /** YYYY-MM-DD de la noche */
  rateDate: string
  /** aforo con el que se consultó el portal */
  guests: number
  /** € por noche que veía el huésped */
  precioEscaparate: number
  /**
   * € por noche de base en Smoobu ESE día. `null` = no tenemos snapshot de esa noche: la muestra
   * no se puede usar (no es un ratio de 1, es un ratio desconocido).
   */
  precioBase: number | null
}

export interface MarkupMedido {
  /** markup real (escaparate ÷ base), o `null` si no hay muestra suficiente para afirmarlo */
  markup: number | null
  /** muestras que han entrado en la mediana */
  muestras: number
  /** por qué no hay markup, cuando no lo hay (para poder DECIRLO en vez de callar) */
  motivo?: 'sin_muestras' | 'muestra_corta'
}

/** Muestras mínimas para fiarnos de la mediana. Por debajo se dice «no lo sé», no se inventa 1,0. */
export const MIN_MUESTRAS_MARKUP = 3
/** Desviación a partir de la cual el markup configurado deja de describir la realidad. */
export const TOLERANCIA_MARKUP = 0.05

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Markup REAL del canal a partir de las mediciones del escaparate.
 *
 * Solo entran las muestras del aforo máximo del piso y con base conocida; el resultado es la
 * MEDIANA (una noche con oferta puntual no debe mover el divisor de todo el calendario).
 */
export function markupMedido(
  muestras: MuestraEscaparate[],
  opts: { aforoMax: number; minMuestras?: number },
): MarkupMedido {
  const minMuestras = opts.minMuestras ?? MIN_MUESTRAS_MARKUP
  const utiles = (muestras ?? []).filter(m =>
    Number(m.guests) === Number(opts.aforoMax) &&
    Number.isFinite(Number(m.precioEscaparate)) && Number(m.precioEscaparate) > 0 &&
    m.precioBase != null && Number.isFinite(Number(m.precioBase)) && Number(m.precioBase) > 0)

  if (utiles.length === 0) return { markup: null, muestras: 0, motivo: 'sin_muestras' }
  if (utiles.length < minMuestras) {
    return { markup: null, muestras: utiles.length, motivo: 'muestra_corta' }
  }
  const ratios = utiles.map(m => Number(m.precioEscaparate) / Number(m.precioBase))
  return { markup: Number(mediana(ratios).toFixed(3)), muestras: utiles.length }
}

export interface DesviacionMarkup {
  estado: 'sin_datos' | 'ok' | 'desviado'
  /** markup configurado en `pricing_settings` */
  configurado: number
  /** markup medido en el portal, o null si no se ha podido medir */
  medido: number | null
  /**
   * Cuánto se desplaza el precio listado por creerse el markup equivocado, en tanto por uno:
   * >0 = listamos POR DEBAJO del mercado que medimos (el caso caro). `null` sin medición.
   */
  sesgo: number | null
}

/**
 * ¿Describe el markup configurado lo que ve el huésped?
 *
 * Sin medición devuelve `sin_datos` — nunca `ok`. Un check que se pone verde porque no hay datos
 * es el fallo más caro que hay (regla de CLAUDE.md: dato que NO hay ≠ dato que no se ha mirado).
 */
export function desviacionMarkup(p: {
  configurado: number
  medido: number | null
  tolerancia?: number
}): DesviacionMarkup {
  const tol = p.tolerancia ?? TOLERANCIA_MARKUP
  const configurado = Number(p.configurado)
  if (p.medido == null || !Number.isFinite(Number(p.medido)) || Number(p.medido) <= 0) {
    return { estado: 'sin_datos', configurado, medido: null, sesgo: null }
  }
  const medido = Number(p.medido)
  // Lo que de verdad duele no es la diferencia entre los dos números, sino el precio que se pierde:
  // el motor divide por `configurado` y el huésped paga `medido`, así que el listado se queda en
  // (medido / configurado) del mercado objetivo.
  const sesgo = Number((configurado / medido - 1).toFixed(4))
  const estado = Math.abs(medido - configurado) / configurado > tol ? 'desviado' : 'ok'
  return { estado, configurado, medido, sesgo }
}
