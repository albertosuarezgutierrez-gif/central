// Municipio del catálogo de Avant2 (Codeoscopic `/towns?postalCode=`) a partir de lo que ya se sabe del CP (21/10/2026).
// PURO: sin red; importable desde 'use client'. Regla de la casa (CLAUDE.md «Direcciones postales»): CP → municipios en un
// desplegable, y si UNO solo casa, preseleccionado. 🚫 Solo EXACTO tras normalizar (tildes, mayúsculas, artículos, «Alacant/Alicante»);
// ante la duda NO se preselecciona: lo elige una persona (un municipio equivocado cambia el precio).

export type OpcionMunicipio = { id: string; nombre: string }

const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'l', 'els', 'les'])

const sinSignos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Variantes normalizadas de un nombre de municipio: «Puerto de Santa María, El» = «El Puerto de Santa María» = «Puerto de Santa Maria»; «Alicante/Alacant» da las dos. */
export function clavesMunicipio(nombre: string): string[] {
  const out = new Set<string>()
  for (const parte of nombre.split('/')) {
    // «Nombre, El» → «El Nombre»
    const m = /^(.*),\s*([^,]+)$/.exec(parte.trim())
    const reordenado = m && ARTICULOS.has(sinSignos(m[2]!)) ? `${m[2]} ${m[1]}` : parte
    const toks = sinSignos(reordenado).split(' ').filter(Boolean)
    if (toks.length === 0) continue
    out.add(toks.join(' '))
    if (toks.length > 1 && ARTICULOS.has(toks[0]!)) out.add(toks.slice(1).join(' '))
  }
  return [...out]
}

/**
 * La opción del catálogo que se puede preseleccionar. Dos vías, y nada más:
 *  · `guardado`: el municipio guardado, que el llamante pasa SOLO si el CP no ha cambiado; vale si casa con UNA opción;
 *  · `ine`: la tabla INE del CP, SOLO si el CP tiene un único municipio (con varios no se preselecciona aunque el catálogo
 *    traiga solo uno de ellos: podría ser el que no es). `null` = tabla desconocida.
 * `null` si no casa ninguna o casan dos (ambiguo). PURA.
 */
export function elegirMunicipioCatalogo(opciones: readonly OpcionMunicipio[], e: { guardado?: string | null; ine?: readonly string[] | null }): OpcionMunicipio | null {
  const casa = (nombres: readonly (string | null | undefined)[]): OpcionMunicipio | null => {
    const buscadas = new Set(nombres.flatMap((n) => (typeof n === 'string' && n.trim() !== '' ? clavesMunicipio(n) : [])))
    if (buscadas.size === 0) return null
    const hallados = opciones.filter((o) => clavesMunicipio(o.nombre).some((c) => buscadas.has(c)))
    return hallados.length === 1 ? hallados[0]! : null
  }
  const porGuardado = casa([e.guardado])
  if (porGuardado) return porGuardado
  return e.ine && e.ine.length === 1 ? casa(e.ine) : null
}
