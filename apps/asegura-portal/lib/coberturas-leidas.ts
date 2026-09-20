/**
 * Las GARANTÍAS que la IA leyó del PDF, limpias (20/09/2026).
 *
 * Fichero aparte y sin imports a propósito: `extraer-poliza.ts` importa sin
 * extensión y no se puede cargar en `node --test`; esto sí, y la regla de
 * «null ≠ []» es de las que hay que poder ver fallar.
 */

/** Tope de garantías por póliza: un documento real enumera 5-20; más es que el
 *  modelo ha volcado el clausulado. */
export const MAX_COBERTURAS_LEIDAS = 30
const MAX_LARGO_COBERTURA = 80

/**
 * Lista de textos cortos, sin centinelas ni duplicados. `null` cuando la clave
 * no viene o no es una lista: eso es «no leído», y NO se colapsa a `[]`, que
 * afirmaría que el documento no tiene coberturas. Lo que no sea texto, esté
 * vacío, sea un «no consta» o pase del largo se descarta; si tras eso no
 * queda nada pero la lista venía, es `[]` (el modelo dijo «ninguna»).
 */
export function normalizarCoberturasLeidas(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const vistas = new Set<string>()
  const salida: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const t = x.replace(/\s+/g, ' ').trim()
    if (t === '' || t.length > MAX_LARGO_COBERTURA) continue
    if (/^(n\/?a|no consta|desconocid[oa]|ninguna?|-+|—)$/i.test(t)) continue
    const clave = t.toLowerCase()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(t)
    if (salida.length >= MAX_COBERTURAS_LEIDAS) break
  }
  return salida
}
