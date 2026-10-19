// Casado PURO de la «Compañía actual del vehículo» de Allianz Turismos contra las opciones del portal (v0.6.15, 19/10/2026).
// Trabajo real 02fd821b: 96 opciones con nombres de registro («LÍNEA DIRECTA/SEGUROS NUEZ», «GENERALI-LA ESTRELLA»,
// «ZURICH INSURANCE PLC SUC. ESPAÑA»…) y una ficha que dice «Línea Directa»: no casaba y «SIGUIENTE» quedaba deshabilitado.
// Reglas: normalizar (mayúsculas, tildes, puntuación, formas societarias y relleno), trocear la opción por «/» y «-» como ALIAS,
// y casar por niveles; el primer nivel con candidatas decide. Una sola candidata = esa; varias = AMBIGUA (nunca se elige);
// ninguna = no casa. Jamás por parecido de letras ni se inventa una compañía. Sin Playwright, sin red, sin datos personales.

const RELLENO = new Set([
  'sa', 'sau', 'sl', 'seguros', 'seguro', 'reaseguros', 'reaseguro', 'compania', 'cia', 'de', 'del', 'la', 'el', 'y', 'e', 'en',
  'sociedad', 'anonima', 'grupo', 'the', 'suc', 'sucursal', 'espana', 'plc', 'mps', 'ag',
])

/** Minúsculas, sin tildes (conserva la ñ como «n»), sin puntuación ni forma jurídica ni relleno. Puro. */
export function normalizarCompania(t: string | null | undefined): string {
  const base = String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bs\s*\.\s*a\s*\.?(\s*u\s*\.?)?(?=[\s,]|$)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
  return base.split(/\s+/).filter((w) => w !== '' && !RELLENO.has(w)).join(' ')
}

/** Alias de una opción: el nombre entero y cada trozo separado por «/» o «-», normalizados y sin repetir. Puro. */
export function aliasDeOpcion(opcion: string): string[] {
  const trozos = String(opcion ?? '').split(/\s*[/–—-]\s*/)
  const out = new Set<string>()
  const entera = normalizarCompania(opcion)
  if (entera !== '') out.add(entera)
  for (const t of trozos) {
    const n = normalizarCompania(t)
    if (n !== '') out.add(n)
  }
  return [...out]
}

/** Palabras que convierten una marca en OTRA compañía (Allianz ≠ Allianz Direct, Zurich ≠ Zurich Connect): sobrando en la opción, no casa. */
const DIFERENCIADORAS = new Set(['direct', 'connect', 'online', 'digital'])

/** `clave` es PREFIJO por palabras completas de `texto` y lo que sobra en `texto` no cambia de compañía. */
const esPrefijoDePalabras = (texto: string, clave: string): boolean => {
  if (clave === '' || !` ${texto} `.startsWith(` ${clave} `)) return false
  const resto = texto.slice(clave.length).split(' ').filter((w) => w !== '')
  return !resto.some((w) => DIFERENCIADORAS.has(w))
}

export type CasadoCompania =
  | { estado: 'unica'; indice: number; indices: number[] }
  | { estado: 'ambigua'; indices: number[] }
  | { estado: 'ninguna'; indices: number[] }

/**
 * Índices de las opciones que casan con `buscada`, por niveles (el primero con alguna decide):
 *  1 clave igual a la del nombre entero · 2 clave igual a un alias · 3 la clave es PREFIJO por palabras completas del nombre o de un alias
 *  (todas las palabras del riesgo están, en orden, al principio; «Mapfre» → «MAPFRE ESPAÑA…», «Allianz» NO → «BBVA ALLIANZ» ni «ALLIANZ DIRECT…»).
 *  Sin nivel «el alias está dentro del riesgo»: elegir otra compañía es peor que no elegir. Puro.
 */
export function indicesCompaniaActual(opciones: readonly string[], buscada: string | null | undefined): number[] {
  const b = normalizarCompania(buscada)
  if (b === '') return []
  const alias = opciones.map(aliasDeOpcion)
  const enteras = opciones.map(normalizarCompania)
  const nivel = (f: (i: number) => boolean): number[] => opciones.flatMap((_, i) => (f(i) ? [i] : []))
  const n1 = nivel((i) => enteras[i] === b)
  if (n1.length > 0) return n1
  const n2 = nivel((i) => alias[i].includes(b))
  if (n2.length > 0) return n2
  const n3 = nivel((i) => alias[i].some((a) => esPrefijoDePalabras(a, b)))
  if (n3.length === 0) return n3
  // Un prefijo único no basta si la clave aparece también, como palabras completas, en OTRA opción («Alfa» → «ALFA VIDA» y
  // «ASEGURADORA ALFA»): se devuelven todas para que salga AMBIGUA y no se elija.
  const contienen = nivel((i) => alias[i].some((a) => ` ${a} `.includes(` ${b} `) && !a.split(' ').some((w) => DIFERENCIADORAS.has(w) && !b.split(' ').includes(w))))
  return [...new Set([...n3, ...contienen])].sort((x, y) => x - y)
}

/** Resultado del casado: una, varias (ambigua) o ninguna. Puro. */
export function casarCompaniaActual(opciones: readonly string[], buscada: string | null | undefined): CasadoCompania {
  const indices = indicesCompaniaActual(opciones, buscada)
  if (indices.length === 1) return { estado: 'unica', indice: indices[0], indices }
  return indices.length === 0 ? { estado: 'ninguna', indices } : { estado: 'ambigua', indices }
}

const MAX_CANDIDATAS_EN_MENSAJE = 8

/** Mensaje de «varias opciones casan» con las candidatas (nombres de aseguradoras del catálogo, nunca datos personales). Puro. */
export function mensajeCompaniaAmbigua(buscada: string, candidatas: readonly string[]): string {
  const ver = candidatas.slice(0, MAX_CANDIDATAS_EN_MENSAJE).join(' | ')
  const resto = candidatas.length > MAX_CANDIDATAS_EN_MENSAJE ? ` (+${candidatas.length - MAX_CANDIDATAS_EN_MENSAJE} más)` : ''
  return `la compañía actual «${buscada.replace(/\s+/g, ' ').trim().slice(0, 80)}» casa con ${candidatas.length} opciones de Allianz y no se elige ninguna; indicar cuál: ${ver}${resto}`
}
