// ────────────────────────────────────────────────────────────────────────────
// Rescate de PDFs ESCANEADOS. PURO (opera sobre bytes, sin red ni dependencias).
//
// El problema: las certificaciones registrales que el BOE adjunta a sus fichas
// son fotocopias. `pdf-parse` devuelve 0 caracteres y el pipeline las descartaba
// en silencio, que es la razón por la que 30 de 34 subastas vigentes decían
// «Cargas no publicadas» teniendo la certificación colgada de la ficha.
//
// La técnica (validada a mano el 30/07/2026 con SUB-JA-2026-264269): el PDF lleva
// las páginas como JPEG embebidos, y esos JPEG se pueden localizar por sus
// marcadores SOI (FF D8 FF) y EOI (FF D9) sin parsear la estructura del PDF ni
// descomprimir nada. Después se leen con un modelo de visión.
//
// El detalle que no es obvio: muchos escáneres NO guardan una imagen por página,
// sino decenas de BANDAS horizontales (263 en el caso real, para 11 páginas). Una
// banda suelta es ilegible y mandarlas de una en una al modelo multiplicaría el
// coste por 25, así que hay que agruparlas antes de recomponerlas. La composición
// en sí necesita una librería de imagen (sharp) y vive en la app; aquí solo se
// localizan y se agrupan, que es la parte pura y testeable.
// ────────────────────────────────────────────────────────────────────────────

/** Un JPEG localizado dentro del PDF. `fin` es exclusivo. */
export interface ImagenEmbebida {
  inicio: number
  fin: number
  bytes: number
}

/** Menos de esto es una miniatura, un icono o el escudo del membrete. */
const MIN_BYTES_UTIL = 3000

/**
 * Localiza los JPEG embebidos en el binario de un PDF, en orden de aparición
 * (que es el orden de las páginas en todos los escaneos vistos).
 *
 * No decodifica: solo devuelve los offsets, para que el caller decida qué copiar
 * y no haya que duplicar en memoria un PDF de 8 MB.
 */
export function localizarJpegs(pdf: Uint8Array, minBytes = MIN_BYTES_UTIL): ImagenEmbebida[] {
  const out: ImagenEmbebida[] = []
  const n = pdf.length

  for (let i = 0; i + 3 < n; i++) {
    // SOI de JPEG: FF D8 FF (el tercer byte es ya el primer marcador de segmento).
    if (pdf[i] !== 0xff || pdf[i + 1] !== 0xd8 || pdf[i + 2] !== 0xff) continue

    let fin = -1
    for (let j = i + 3; j + 1 < n; j++) {
      if (pdf[j] === 0xff && pdf[j + 1] === 0xd9) {
        fin = j + 2
        break
      }
    }
    if (fin < 0) break // SOI sin EOI: binario truncado, no hay más que rascar.

    const bytes = fin - i
    if (bytes >= minBytes) out.push({ inicio: i, fin, bytes })
    i = fin - 1 // Continuar DESPUÉS de este JPEG: evita reencontrar SOIs internos.
  }

  return out
}

/** Dimensiones de un JPEG, leídas de su primer marcador SOF. */
export interface DimensionesJpeg {
  ancho: number
  alto: number
}

/**
 * Ancho y alto de un JPEG sin decodificarlo, recorriendo sus marcadores hasta
 * el SOF (FFC0..FFCF salvo los que no son SOF). Se necesita para agrupar bandas
 * por anchura y para saber cuánto alto acumula cada grupo. `null` si no hay SOF
 * legible (JPEG progresivo raro o bytes corruptos).
 */
export function dimensionesJpeg(jpeg: Uint8Array): DimensionesJpeg | null {
  let i = 2 // Saltar el SOI.
  const n = jpeg.length

  while (i + 9 < n) {
    if (jpeg[i] !== 0xff) {
      i++
      continue
    }
    const marcador = jpeg[i + 1]
    // SOF0..SOF15 llevan las dimensiones; C4 (DHT), C8 (JPG) y CC (DAC) no lo son.
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      const alto = (jpeg[i + 5] << 8) | jpeg[i + 6]
      const ancho = (jpeg[i + 7] << 8) | jpeg[i + 8]
      return ancho > 0 && alto > 0 ? { ancho, alto } : null
    }
    // Saltar al siguiente marcador usando la longitud del segmento.
    const longitud = (jpeg[i + 2] << 8) | jpeg[i + 3]
    if (longitud < 2) return null
    i += 2 + longitud
  }
  return null
}

export interface BandaAgrupable extends DimensionesJpeg {
  /** Índice en la lista original, para que el caller sepa qué bytes copiar. */
  indice: number
}

/**
 * Agrupa bandas consecutivas en «páginas»: mismo ancho y sin pasar del alto
 * máximo. Devuelve los grupos en orden. Puro: entra la lista de dimensiones,
 * sale cómo hay que apilarlas.
 *
 * `altoMaximo` acota el tamaño de la imagen que se manda al modelo de visión
 * (una torre de 20.000 px se reescala tanto que el texto se pierde).
 */
export function agruparBandas(bandas: BandaAgrupable[], altoMaximo = 3000): BandaAgrupable[][] {
  const grupos: BandaAgrupable[][] = []
  let actual: BandaAgrupable[] = []

  for (const b of bandas) {
    const anchoGrupo = actual[0]?.ancho
    const altoAcumulado = actual.reduce((s, x) => s + x.alto, 0)
    if (actual.length && (b.ancho !== anchoGrupo || altoAcumulado + b.alto > altoMaximo)) {
      grupos.push(actual)
      actual = []
    }
    actual.push(b)
  }
  if (actual.length) grupos.push(actual)

  // Un grupo de pocos píxeles de alto es una línea de separación o ruido del
  // escáner: no vale una llamada al modelo.
  return grupos.filter((g) => g.reduce((s, x) => s + x.alto, 0) >= 200)
}

/**
 * ¿El texto extraído de un PDF da para leerlo, o es un escaneo? El umbral es
 * por CARACTERES ÚTILES (sin espacios): un PDF escaneado suele devolver un
 * puñado de caracteres basura, no una cadena vacía limpia.
 */
export function pareceEscaneado(texto: string | null | undefined, minChars = 500): boolean {
  return (texto ?? '').replace(/\s+/g, '').length < minChars
}
