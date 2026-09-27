// Puro (sin BD): lo usa `tomador-documento.ts` para buscar un tomador por su nombre.
const SIN_ACENTOS = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Las palabras que tienen que estar en el nombre: sin acentos, sin comas ni partículas («de», «la»). */
export function palabrasNombre(nombre: string): string[] {
  const vacias = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'e'])
  const p = SIN_ACENTOS(nombre).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter((x) => x.length >= 2 && !vacias.has(x))
  return [...new Set(p)].slice(0, 6)
}
