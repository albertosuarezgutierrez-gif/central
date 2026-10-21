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
 * La opción del catálogo que casa con alguno de los nombres conocidos (lo guardado en la ficha, la tabla INE del CP).
 * `null` si ninguna casa o si casan DOS opciones distintas (ambiguo). Una sola opción en el catálogo se resuelve fuera
 * (el CP solo tiene ese municipio), no aquí. PURA.
 */
export function elegirMunicipioCatalogo(opciones: readonly OpcionMunicipio[], nombresConocidos: readonly (string | null | undefined)[]): OpcionMunicipio | null {
  const buscadas = new Set(nombresConocidos.flatMap((n) => (typeof n === 'string' && n.trim() !== '' ? clavesMunicipio(n) : [])))
  if (buscadas.size === 0) return null
  const hallados = opciones.filter((o) => clavesMunicipio(o.nombre).some((c) => buscadas.has(c)))
  return hallados.length === 1 ? hallados[0]! : null
}
