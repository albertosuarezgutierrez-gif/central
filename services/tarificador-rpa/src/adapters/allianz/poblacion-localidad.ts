// Allianz · elección AUTOMÁTICA de la población del CP por la localidad del riesgo (v0.7.3 Moto, 20/10/2026). PURO: ni red ni BD.
// Complementa `resolverPoblacion` (exacta y única): cuando el CP da varias poblaciones y la `poblacion` no casa exacta, se
// prueba con CADA localidad que trae el riesgo (poblacion y localidad del tomador cuando su CP es el mismo) por CONTENCIÓN de
// palabras enteras (normalizado: mayúsculas, sin tildes). Solo se elige si TODO candidato que casa apunta a la MISMA opción y
// cada candidato casa con UNA sola. Un candidato que casa con varias (p. ej. solo el municipio y el CP tiene varias pedanías) se descarta y se prueba el siguiente; si
// los candidatos se contradicen o si ninguno casa → `null` (persona). Los nombres no se escriben en logs.
import { clavePoblacion, type OpcionPoblacion } from '@central/module-tarificacion'

const MIN_LONGITUD = 3

/** ¿`corta` está dentro de `larga` como secuencia de PALABRAS enteras? (ambas ya normalizadas con `clavePoblacion`). */
export function contienePalabras(larga: string, corta: string): boolean {
  if (corta.length < MIN_LONGITUD) return false
  return ` ${larga.replace(/[^A-Z0-9Ñ ]/g, ' ').replace(/\s+/g, ' ').trim()} `.includes(` ${corta.replace(/[^A-Z0-9Ñ ]/g, ' ').replace(/\s+/g, ' ').trim()} `)
}

function casanCon(opciones: readonly OpcionPoblacion[], candidato: string): OpcionPoblacion[] {
  const k = clavePoblacion(candidato.replace(/^\s*\d{5}\s*-\s*/, ''))
  if (k.length < MIN_LONGITUD) return []
  const exactas = opciones.filter((o) => clavePoblacion(o.etiqueta) === k)
  if (exactas.length > 0) return exactas
  return opciones.filter((o) => {
    const ko = clavePoblacion(o.etiqueta)
    return contienePalabras(ko, k) || contienePalabras(k, ko)
  })
}

/** La opción que corresponde a las localidades del riesgo, o `null` (ninguna, varias o candidatos que se contradicen). */
export function elegirPoblacionPorLocalidades(opciones: readonly OpcionPoblacion[], candidatos: ReadonlyArray<string | null | undefined>): OpcionPoblacion | null {
  const elegidas = new Set<string>()
  for (const c of candidatos) {
    if (typeof c !== 'string' || c.trim() === '') continue
    const casan = casanCon(opciones, c)
    if (casan.length === 0) continue
    // Un candidato que casa con VARIAS opciones (municipio con varias pedanías) no se resuelve a ciegas: se DESCARTA y se
    // sigue con el siguiente (v0.7.4); si ninguno da una sola, persona.
    if (casan.length > 1) continue
    elegidas.add(casan[0].codigo)
  }
  if (elegidas.size !== 1) return null
  return opciones.find((o) => o.codigo === [...elegidas][0]) ?? null
}

/** Resultado de elegir la población en la lista desplegada de Allianz Hogar (`town`). `indice` = posición en `textos`. */
export type EleccionPoblacionHogar = { tipo: 'elegida'; indice: number } | { tipo: 'sin_opciones' } | { tipo: 'sin_municipio' } | { tipo: 'sin_coincidencia' }

const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL'])

const fichas = (t: string): string[] => clavePoblacion(t).replace(/[^A-Z0-9Ñ ]/g, ' ').split(/\s+/).filter((w) => w !== '' && !PALABRAS_VACIAS.has(w))

/** «PARRA LA (VENTAS CARRIZA)» → «VENTAS CARRIZA» (el núcleo entre paréntesis del callejero del Catastro); sin paréntesis → `null`. */
export function nucleoDeVia(nombreVia: string | null | undefined): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(nombreVia ?? '')
  return m && fichas(m[1]).length > 0 ? m[1].trim() : null
}

/** Cada ficha de la aguja es igual a una ficha de la opción o prefijo (≥4 letras) de una (el Catastro trunca: «CARRIZA» ↔ «CARRIZAL»). */
function agujaCasa(aguja: string, opcion: string): boolean {
  const fa = fichas(aguja)
  const fo = fichas(opcion)
  return fa.length > 0 && fa.every((w) => fo.some((o) => o === w || (w.length >= 4 && o.startsWith(w))))
}

/**
 * Allianz Hogar (21/10/2026): el CP tiene varias poblaciones (p. ej. 23693) y el portal no autocompleta `town`. Elige la opción de
 * la lista (texto sin prefijo «CP -») probando, en orden y aceptando solo una coincidencia ÚNICA: (1) el núcleo entre paréntesis del
 * nombre de la vía (fichas iguales o prefijo ≥4 letras, sin del/de/la/…); (2) el municipio (exacto o palabras enteras);
 * (3) si el portal ofrece UNA sola opción, esa (el CP la fija). Si no, no se elige (atasco con la lista). PURA.
 */
export function elegirPoblacionHogar(textos: readonly string[], municipio: string | null, nombreVia: string | null = null): EleccionPoblacionHogar {
  if (textos.length === 0) return { tipo: 'sin_opciones' }
  const etiquetas = textos.map((t) => t.replace(/^\s*\d{5}\s*-\s*/, '').trim())
  const nucleo = nucleoDeVia(nombreVia)
  if (nucleo !== null) {
    const casan = etiquetas.map((e, i) => (agujaCasa(nucleo, e) ? i : -1)).filter((i) => i >= 0)
    if (casan.length === 1) return { tipo: 'elegida', indice: casan[0] }
  }
  if (municipio !== null && municipio.trim() !== '') {
    const o = elegirPoblacionPorLocalidades(etiquetas.map((etiqueta, i) => ({ codigo: String(i), etiqueta })), [municipio])
    if (o !== null) return { tipo: 'elegida', indice: Number(o.codigo) }
  }
  if (textos.length === 1) return { tipo: 'elegida', indice: 0 }
  return nucleo === null && (municipio === null || municipio.trim() === '') ? { tipo: 'sin_municipio' } : { tipo: 'sin_coincidencia' }
}
