// ────────────────────────────────────────────────────────────────────────────
// Comparables de mercado a partir de las alertas de portales inmobiliarios que
// Alberto ya recibe. PURO.
//
// POR QUÉ EXISTE: el BOE publica «Tasación 0,00 €» en la práctica totalidad de
// las subastas (comprobado en las 4 reales), y el valor de referencia del
// Catastro exige certificado digital. Sin una referencia de mercado, el
// descuento no se puede calcular y el radar solo dice QUÉ se subasta, no si
// está barato. Estos comparables son esa referencia — y salen de correos que
// ya llegan, sin contratar nada.
//
// SOLO IDEALISTA: sus alertas traen precio Y superficie por anuncio
// («265.000 €» + «110 m² 3 hab.»). Las de Fotocasa solo dicen «tienes N
// anuncios en X» sin detalle, así que no sirven para calcular €/m².
// ────────────────────────────────────────────────────────────────────────────

import { decodificarHtml } from './email-boe.ts'
import { norm, parseImporteEs } from './parsing.ts'

/**
 * Qué se anuncia. Importa porque el €/m² de un garaje o de un solar NO es
 * comparable con el de una vivienda, y las alertas de Alberto mezclan ambos:
 * su única búsqueda guardada en Sevilla es de garajes.
 */
export type TipoComparable = 'vivienda' | 'garaje' | 'local' | 'terreno' | 'otro'

export interface Comparable {
  portal: 'idealista'
  /** Id del anuncio en el portal; sirve de clave de deduplicación. */
  refAnuncio: string
  titulo: string
  tipo: TipoComparable
  /** Zona tal cual la nombra el anuncio («Islantilla Golf, Islantilla»). */
  zona: string | null
  precio: number
  superficie: number | null
  habitaciones: number | null
  /** €/m². `null` si falta la superficie. */
  precioM2: number | null
  url: string | null
}

function texto(html: string): string {
  return decodificarHtml(html.replace(/<[^>]+>/g, ' '))
}

/**
 * Tipo del anuncio a partir de su título («Chalet adosado en…», «Garaje en…»).
 * El portal siempre lo antepone, así que basta con mirar el principio.
 */
export function tipoComparable(titulo: string): TipoComparable {
  const t = norm(titulo)
  if (/\b(garaje|plaza de garaje|trastero|aparcamiento)\b/.test(t)) return 'garaje'
  if (/\b(local|nave|oficina|edificio)\b/.test(t)) return 'local'
  if (/\b(terreno|solar|parcela|finca rustica)\b/.test(t)) return 'terreno'
  if (/\b(piso|chalet|casa|atico|duplex|apartamento|estudio|adosado|pareado|vivienda|loft)\b/.test(t)) return 'vivienda'
  return 'otro'
}

/**
 * Extrae los anuncios de una alerta de Idealista.
 *
 * El correo repite un bloque por anuncio: enlace a `/inmueble/<id>/` con el
 * título en el atributo `title`, y una tabla con el precio en grande y una
 * línea «110 m² 3 hab.».
 */
export function parsearAlertaIdealista(html: string): Comparable[] {
  if (!html) return []

  // Trocear por anuncio: cada uno arranca en su enlace /inmueble/<id>/.
  const bloques: Array<{ id: string; desde: number }> = []
  const re = /\/inmueble\/(\d+)\//g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (!bloques.some((b) => b.id === m![1])) bloques.push({ id: m[1], desde: m.index })
  }
  if (!bloques.length) return []

  const out: Comparable[] = []
  for (let i = 0; i < bloques.length; i++) {
    const hasta = i + 1 < bloques.length ? bloques[i + 1].desde : html.length
    // Se mira desde el enlace anterior para no perder el título ni el precio,
    // que pueden ir antes del último enlace del mismo anuncio.
    const trozo = html.slice(bloques[i].desde, hasta)

    const titulo = trozo.match(/title="([^"]{5,160})"/)?.[1]
    if (!titulo) continue
    const t = decodificarHtml(titulo)

    const plano = texto(trozo)

    // El precio va en un <span> grande; se coge el primero con € del bloque.
    // El `(?!\s*\/)` descarta el «2.000 €/m²» que el resumen diario imprime al
    // lado del precio: sin él, ese bloque tomaría 2.000 € como precio del piso.
    const precio = parseImporteEs(plano.match(/([\d.]+(?:,\d+)?)\s*€(?!\s*\/)/)?.[1] ?? '')
    if (precio == null || precio < 1000) continue

    // OJO: la superficie del portal lleva decimal ESPAÑOL («140,00 m²»). Sin la
    // parte «(?:,\d+)?» la expresión casaba solo los decimales («00») y daba 0.
    const sup = plano.match(/(\d[\d.]*(?:,\d+)?)\s*m²/)
    const hab = plano.match(/(\d+)\s*hab/)
    const superficie = sup ? parseImporteEs(sup[1]) : null

    // El resumen diario publica el €/m² ya calculado; es el dato del portal y
    // manda sobre el nuestro. En las alertas de anuncio suelto no viene y se
    // deriva de precio/superficie.
    const m2Portal = parseImporteEs(plano.match(/([\d.]+(?:,\d+)?)\s*€\s*\/\s*m²/)?.[1] ?? '')

    out.push({
      portal: 'idealista',
      refAnuncio: bloques[i].id,
      titulo: t,
      tipo: tipoComparable(t),
      // El título es «<Tipo> en <zona>»: la zona es lo que sigue al « en ».
      zona: t.match(/\ben\s+(.{3,120})$/i)?.[1]?.trim() ?? null,
      precio,
      superficie,
      habitaciones: hab ? Number(hab[1]) : null,
      precioM2:
        m2Portal != null && m2Portal > 0
          ? Math.round(m2Portal)
          : superficie && superficie > 0
            ? Math.round(precio / superficie)
            : null,
      url: `https://www.idealista.com/inmueble/${bloques[i].id}/`,
    })
  }
  return out
}

/** ¿Es este correo una alerta de Idealista? */
export function esAlertaIdealista(remitente: string | null | undefined): boolean {
  return (remitente ?? '').toLowerCase().includes('idealista.com')
}

/**
 * Superficie por encima de la cual el anuncio está midiendo la PARCELA y no lo
 * construido.
 *
 * Caso real (Isla Cristina, 27/07/2026): «310.000 € · 310 €/m² · 4 hab ·
 * 1.000,00 m²». Ese 310 €/m² es precio de suelo y no es comparable con los
 * ~2.100 €/m² construidos de la misma zona — mezclarlos hunde la referencia.
 * Se descarta el comparable entero, no se intenta adivinar lo construido.
 */
const SUPERFICIE_MAX_COMPARABLE = 400

function esParcela(c: Comparable): boolean {
  return c.superficie != null && c.superficie > SUPERFICIE_MAX_COMPARABLE
}

/**
 * €/m² de referencia para una zona: MEDIANA de los comparables de VIVIENDA
 * cuyo texto de zona contiene el término buscado.
 *
 * Se usa la mediana y no la media porque un chalet de lujo suelto dispara la
 * media y dejaría de avisar de gangas reales. Devuelve `null` con menos de
 * `minMuestra` comparables: una referencia con dos anuncios no es referencia.
 */
export function precioM2Zona(
  comparables: Comparable[],
  zona: string,
  minMuestra = 3,
): { precioM2: number; muestra: number } | null {
  const z = norm(zona)
  if (!z) return null

  const valores = comparables
    .filter(
      (c) =>
        c.precioM2 != null &&
        c.tipo === 'vivienda' &&
        !esParcela(c) &&
        norm(`${c.zona ?? ''} ${c.titulo}`).includes(z),
    )
    .map((c) => c.precioM2!)
    .sort((a, b) => a - b)

  if (valores.length < minMuestra) return null
  const mitad = Math.floor(valores.length / 2)
  const mediana = valores.length % 2 ? valores[mitad] : (valores[mitad - 1] + valores[mitad]) / 2
  return { precioM2: Math.round(mediana), muestra: valores.length }
}

// ── Chollos de venta directa ─────────────────────────────────────────────────
// Los comparables son ANUNCIOS EN VENTA: el mismo dato que valora las subastas
// sirve para detectar el piso barato de portal. Un chollo es un anuncio cuyo
// €/m² queda muy por debajo de la mediana de SU zona — un número contrastable,
// no una nota de IA. (Sustituye al `puntuacion_chollo` del viejo lector de
// `/sivra/inversion`, que puntuaba a ojo y llevaba parado desde mayo.)

/** Descuento mínimo sobre la mediana de la zona para considerar chollo. */
export const CHOLLO_DESCUENTO_MIN = 0.2
/**
 * Por encima de esto el "chollo" es sospechoso: en la práctica suele ser un
 * error del anuncio (€/m² de parcela, precio mal escrito, ruina a reformar).
 * Se enseña igualmente, pero marcado — que decida un humano.
 */
export const CHOLLO_DESCUENTO_SOSPECHOSO = 0.5

export interface Chollo {
  comparable: Comparable
  /** Zona con la que se ha comparado (la fina si tuvo muestra; si no, el municipio). */
  zona: string
  /** Mediana €/m² de la zona SIN contar el propio anuncio. */
  precioM2Zona: number
  muestra: number
  /** 1 − precioM2/mediana. */
  descuento: number
  sospechoso: boolean
}

/**
 * Zonas por las que comparar un anuncio, de fina a amplia. Idealista publica la
 * zona a nivel de CALLE («Paseo Flecha de Nueva Umbría, 3, Islantilla Golf,
 * Islantilla»): comparar por la cadena exacta daría muestra 0 casi siempre.
 * Se recorta a los dos últimos tramos no numéricos (barrio + municipio) y,
 * como red, al municipio solo.
 */
export function zonasDeComparable(zona: string | null | undefined): string[] {
  if (!zona) return []
  const partes = zona
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^\d+\s*[a-z]?$/i.test(p)) // «38», «14 b» → fuera
  if (!partes.length) return []
  const out: string[] = []
  if (partes.length >= 2) out.push(partes.slice(-2).join(', '))
  out.push(partes[partes.length - 1])
  return [...new Set(out)]
}

/**
 * Detecta chollos entre los comparables. Para cada anuncio de vivienda con
 * €/m², busca la mediana de su zona EXCLUYÉNDOSE a sí mismo (si no, el propio
 * chollo arrastra la mediana hacia abajo y se auto-oculta) y mide el descuento.
 */
export function detectarChollos(
  comparables: Comparable[],
  minDescuento = CHOLLO_DESCUENTO_MIN,
  minMuestra = 3,
): Chollo[] {
  const out: Chollo[] = []
  for (const c of comparables) {
    if (c.tipo !== 'vivienda' || c.precioM2 == null || c.precioM2 <= 0 || esParcela(c)) continue

    const resto = comparables.filter((x) => x.refAnuncio !== c.refAnuncio)
    for (const z of zonasDeComparable(c.zona)) {
      const ref = precioM2Zona(resto, z, minMuestra)
      if (!ref) continue
      const descuento = 1 - c.precioM2 / ref.precioM2
      if (descuento >= minDescuento) {
        out.push({
          comparable: c,
          zona: z,
          precioM2Zona: ref.precioM2,
          muestra: ref.muestra,
          descuento,
          sospechoso: descuento > CHOLLO_DESCUENTO_SOSPECHOSO,
        })
      }
      break // la primera zona con muestra decide; la amplia solo es red de la fina
    }
  }
  return out.sort((a, b) => b.descuento - a.descuento)
}
