// Buscador de texto (sin IA) para la póliza: sin tildes ni mayúsculas; varias palabras = todas cerca. PURO.

export type FragmentoBusqueda = { posicion: number; fragmento: string }

/** Minúsculas y sin tildes, SIN cambiar la longitud (los índices valen para el texto original). */
export function plegar(s: string): string {
  let o = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    o += f.length === 1 ? f : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch
  }
  return o
}

function posiciones(h: string, aguja: string): number[] {
  const r: number[] = []
  for (let i = h.indexOf(aguja); i !== -1; i = h.indexOf(aguja, i + 1)) r.push(i)
  return r
}

/**
 * Hasta `max` fragmentos (±`contexto` caracteres). Varias palabras: todas dentro de una ventana de `ventana` caracteres.
 * Los aciertos que caen dentro del fragmento anterior no se repiten.
 */
export function buscarEnTexto(
  texto: string,
  consulta: string,
  opc: { max?: number; ventana?: number; contexto?: number } = {},
): FragmentoBusqueda[] {
  const max = opc.max ?? 20
  const ventana = opc.ventana ?? 600
  const contexto = opc.contexto ?? 300
  const palabras = [...new Set(plegar(String(consulta ?? '')).split(/\s+/).filter((p) => p.length > 0))]
  if (palabras.length === 0 || typeof texto !== 'string' || texto === '') return []
  const h = plegar(texto)
  const pos = palabras.map((p) => posiciones(h, p))
  if (pos.some((x) => x.length === 0)) return []
  const out: FragmentoBusqueda[] = []
  let hastaPrevio = -1
  for (const p of pos[0]) {
    if (out.length >= max) break
    if (p < hastaPrevio) continue
    const cerca = pos.slice(1).every((lista) => lista.some((q) => Math.abs(q - p) <= ventana))
    if (!cerca) continue
    const ini = Math.max(0, p - contexto)
    const fin = Math.min(texto.length, p + palabras[0].length + contexto)
    out.push({ posicion: p, fragmento: texto.slice(ini, fin) })
    hastaPrevio = fin
  }
  return out
}
