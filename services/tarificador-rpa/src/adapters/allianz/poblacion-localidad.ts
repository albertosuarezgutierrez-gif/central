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
