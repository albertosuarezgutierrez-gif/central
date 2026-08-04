// ────────────────────────────────────────────────────────────────────────────
// De qué está hecho el «valor de mercado». PURO.
//
// Incidente que lo motiva (30/07/2026, Alberto): un piso de 1965 en la Avenida
// Pedro Romero de Sevilla, tipo de subasta 77.746,93€, salía con un valor de
// mercado de 334.645€ y un margen de flip del 86,7%. La cifra era falsa por
// tres sitios a la vez, y ninguno de los tres tenía que ver con la subasta:
//
//   1. El €/m² era la mediana del MUNICIPIO ENTERO de Sevilla (25 anuncios del
//      buscador de Fotocasa). En una ciudad que va de ~1.500€/m² a ~5.000€/m²
//      según el barrio, esa mediana no describe ningún inmueble concreto.
//   2. Se multiplicaba por los 127 m² del Catastro cuando el registro decía
//      117,10 — un 8% de más antes de empezar.
//   3. No se corregía por estado: la muestra de anuncios mezcla obra nueva y
//      pisos reformados, y este es de 1965 sin tocar.
//
// El valor de mercado es DETERMINANTE (de él salen el descuento, la puntuación,
// el margen del flip y la puja máxima), así que cada uno de los tres se corrige
// aquí, por separado y de forma declarada.
//
// Regla de oro: ante la duda, el valor MENOR. Sobrestimar el mercado fabrica
// chollos que no existen; subestimarlo solo hace perder una oportunidad.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'

// ── 1. ¿La zona de la que sale el €/m² describe al inmueble? ───────────────

/**
 * Municipios donde la mediana MUNICIPAL no vale para tasar un inmueble
 * concreto: son grandes y muy desiguales por barrio. Con uno de estos, la
 * referencia se marca ORIENTATIVA y deja de sostener un aviso o un flip.
 *
 * No es «ciudades grandes» por población sin más: es «sitios donde el barrio
 * cambia el precio más que el metro cuadrado». Por eso están las ocho capitales
 * andaluzas y las ciudades que funcionan como tales — Jerez incluido, que es
 * justo la zona que Alberto quiere mirar para invertir.
 */
export const MUNICIPIOS_HETEROGENEOS = [
  // Capitales andaluzas
  'sevilla', 'malaga', 'cordoba', 'granada', 'cadiz', 'huelva', 'jaen', 'almeria',
  // Ciudades grandes y desiguales
  'jerez de la frontera', 'jerez',
  'dos hermanas', 'alcala de guadaira', 'algeciras', 'marbella', 'mijas',
  'el ejido', 'roquetas de mar', 'utrera', 'linares', 'estepona', 'benalmadena',
  'fuengirola', 'torremolinos', 'velez malaga', 'motril', 'sanlucar de barrameda',
  'san fernando', 'el puerto de santa maria', 'chiclana de la frontera',
  // Fuera de Andalucía, por si el radar se amplía
  'madrid', 'barcelona', 'valencia', 'zaragoza', 'murcia', 'oviedo', 'gijon',
] as const

const HETEROGENEOS = new Set<string>(MUNICIPIOS_HETEROGENEOS.map((m) => norm(m)))

export type GranularidadZona = 'nucleo' | 'distrito' | 'municipio' | 'municipio_heterogeneo'

/**
 * Qué de fina es la zona que sostiene el €/m².
 *
 * `zonaMercado` es la etiqueta que escribe el cron («Matalascañas»,
 * «SEVILLA · san-pablo-santa-justa», «SEVILLA (buscador Fotocasa)»…). El
 * separador ` · ` marca que hay distrito dentro de la capital, y el sufijo
 * «(buscador Fotocasa)» que se cayó al último escalón: la mediana municipal.
 *
 * Devuelve `null` si no hay etiqueta — no se adivina.
 */
export function granularidadZona(
  zonaMercado: string | null | undefined,
  municipio?: string | null,
): GranularidadZona | null {
  if (!zonaMercado || !zonaMercado.trim()) return null

  // «SEVILLA · san-pablo-santa-justa» — hay distrito: es fina aunque la ciudad
  // sea heterogénea, que es precisamente para lo que sirve el distrito.
  if (zonaMercado.includes('·')) return 'distrito'

  const municipal = /\(buscador fotocasa\)/i.test(zonaMercado)
  // La etiqueta municipal viene como «SEVILLA (buscador Fotocasa)»; el resto
  // (núcleos, barrios de los comparables) son zonas propias del anuncio.
  const nombre = norm(zonaMercado.replace(/\(buscador fotocasa\)/i, ''))

  if (!municipal) {
    // Vino del corpus de comparables. Si la etiqueta es literalmente el
    // municipio heterogéneo, sigue siendo demasiado gruesa.
    return HETEROGENEOS.has(nombre) ? 'municipio_heterogeneo' : 'nucleo'
  }

  const muni = norm(municipio ?? '')
  return HETEROGENEOS.has(nombre) || (muni !== '' && HETEROGENEOS.has(muni))
    ? 'municipio_heterogeneo'
    : 'municipio'
}

/**
 * Una referencia ORIENTATIVA se enseña, pero no puede sostener por sí sola un
 * aviso ni un «flip apto»: sabemos que el número no describe al inmueble.
 */
export function referenciaOrientativa(g: GranularidadZona | null): boolean {
  return g === 'municipio_heterogeneo'
}

// ── 2. ¿Sobre cuántos metros se multiplica? ────────────────────────────────

export interface SuperficieValorable {
  m2: number
  fuente: 'registral' | 'catastro' | 'coincidentes'
  aviso: string | null
}

/**
 * Los metros con los que se valora. Cuando hay dos cifras y discrepan se toma
 * la MENOR, y se dice.
 *
 * No es un capricho conservador: con una referencia catastral de PARCELA (14
 * caracteres) el Catastro devuelve datos del edificio, no del piso que se
 * subasta, y esa cifra puede ser disparatadamente alta. La registral sale de la
 * escritura del bien concreto. Ante la duda, la que no infla.
 */
export function superficieValorable(
  registral: number | null | undefined,
  catastral: number | null | undefined,
): SuperficieValorable | null {
  const r = registral != null && registral > 0 ? registral : null
  const c = catastral != null && catastral > 0 ? catastral : null

  if (r == null && c == null) return null
  if (r == null) return { m2: c!, fuente: 'catastro', aviso: null }
  if (c == null) return { m2: r, fuente: 'registral', aviso: null }

  const dif = Math.abs(r - c) / Math.max(r, c)
  if (dif < 0.02) return { m2: Math.min(r, c), fuente: 'coincidentes', aviso: null }

  const menor = Math.min(r, c)
  return {
    m2: menor,
    fuente: menor === r ? 'registral' : 'catastro',
    aviso:
      `Los metros no cuadran: ${r} m² en el registro y ${c} m² en el Catastro ` +
      `(${Math.round(dif * 100)}% de diferencia). Se valora con los ${menor} m², que es la cifra que no infla.`,
  }
}

// ── 3. ¿En qué estado está lo que se compara? ──────────────────────────────

/**
 * Cuánto se le quita al €/m² de los anuncios según la edad del edificio.
 *
 * La muestra de un portal mezcla obra nueva, reformado y «para entrar a vivir»;
 * lo que sale a subasta rara vez es nada de eso. Estos factores son el
 * descuento con el que un piso sin tocar se vende frente al anuncio medio de su
 * zona — deliberadamente suaves, porque el objetivo es dejar de fabricar
 * chollos, no fabricar el error contrario.
 *
 * Se emparejan con los tramos de `reformaEstimada` (flip.ts) para que un mismo
 * inmueble no se clasifique «integral» a un lado y «ligera» al otro.
 */
export const AJUSTE_ESTADO = { integral: 0.8, media: 0.9, ligera: 1 } as const

export interface AjusteEstado {
  factor: number
  nivel: keyof typeof AJUSTE_ESTADO | null
  nota: string | null
}

/**
 * Ajuste por estado a partir del año de construcción. Sin año no se ajusta
 * (factor 1) pero se avisa: inventar una penalización tampoco es honesto.
 */
export function ajusteEstado(
  anioConstruccion: number | null | undefined,
  anioActual: number,
): AjusteEstado {
  if (anioConstruccion == null || anioConstruccion <= 0) {
    return {
      factor: 1,
      nivel: null,
      nota: 'Sin año de construcción: el valor no se ajusta por estado y puede quedar alto.',
    }
  }
  const edad = anioActual - anioConstruccion
  const nivel = edad > 40 ? 'integral' : edad >= 20 ? 'media' : 'ligera'
  const factor = AJUSTE_ESTADO[nivel]
  if (factor === 1) return { factor, nivel, nota: null }
  return {
    factor,
    nivel,
    nota:
      `Edificio de ${anioConstruccion} (${edad} años): se descuenta un ${Math.round((1 - factor) * 100)}% ` +
      `sobre el €/m² de los anuncios, que en su mayoría están reformados o son obra nueva.`,
  }
}
