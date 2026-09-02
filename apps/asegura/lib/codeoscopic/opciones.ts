// Ayudas PURAS sobre opciones de catálogo: sin red, sin config, sin secretos.
// Viven aparte de `catalogos.ts` para que la pantalla (cliente, 'use client')
// pueda importarlas sin arrastrar el cliente HTTP del vendor al navegador.

/** Una entrada de catálogo: lo que se pinta en un desplegable. */
export type Opcion = { id: string; nombre: string }

/** Quita tildes y mayúsculas para comparar «Casado» con «CASADO». */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Busca en un catálogo la opción cuyo nombre coincide con un texto del CRM.
 *
 * 🚫 Solo empareja EXACTO (ya normalizado). Ante la duda devuelve `null`, y el
 * llamante lo trata como «hay que elegirlo a mano». Un emparejamiento por
 * parecido convertiría «Separado» en «Soltero» sin que nadie se entere, y eso
 * cambia el precio. Mismo criterio que `vehicle-catalog-match.ts` del CRM:
 * ante duda, no preselecciona.
 */
export function emparejar(catalogo: Opcion[], texto: string | null): Opcion | null {
  if (texto === null) return null
  const buscado = normalizarTexto(texto)
  if (buscado === '') return null
  const coincidencias = catalogo.filter((o) => normalizarTexto(o.nombre) === buscado)
  return coincidencias.length === 1 ? coincidencias[0] : null
}

/**
 * La opción por defecto de un desplegable: la preferida si el catálogo la
 * trae; si no, la primera; con catálogo vacío, `null` (no hay nada que
 * suponer). El llamante la marca como supuesto en los dos primeros casos.
 */
export function elegirDefecto(catalogo: Opcion[], idPreferido: string | null | undefined): Opcion | null {
  if (catalogo.length === 0) return null
  if (idPreferido) {
    const exacta = catalogo.find((o) => o.id === idPreferido)
    if (exacta) return exacta
  }
  return catalogo[0]
}

/**
 * ¿Esta opción de `/home/uses` significa «propietario»? Sirve para
 * preseleccionar «el tomador es el dueño» (que manda la misma persona como
 * `risk.owner`). Es una preselección visible, no una decisión: el corredor la
 * puede cambiar.
 */
export function pareceOpcionPropietario(o: Opcion | null): boolean {
  if (!o) return false
  const t = `${normalizarTexto(o.id)} ${normalizarTexto(o.nombre)}`
  return /owner|propietari|due[nñ]o/.test(t)
}
