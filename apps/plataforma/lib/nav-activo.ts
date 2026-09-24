// ¿Qué entrada del lateral se pinta como activa?
//
// Vivía inline en `UserSidebar.tsx` como tres comparaciones de string distintas, y dos de ellas
// encendían VARIAS entradas a la vez (medido 02/09/2026):
//
//   · `path.startsWith(href)` SIN la barra: estando en `/sivra/pricing-auto` se encendía también
//     «Pricing Lab» (`/sivra/pricing`), porque una ruta es prefijo de la otra. Igual con
//     `/sivra/pricing-rentabilidad`.
//   · «Inicio» (`/banca`, sin `tab`) se comparaba por ruta, y los segmentos de /banca comparten
//     ruta: en `/banca?tab=ingresos` quedaban encendidos «Inicio» Y «Ingresos».
//
// Dos entradas resaltadas dicen dos cosas contradictorias sobre dónde estás, que es peor que
// ninguna. Aquí es una función pura y con test, no una comparación repetida en tres sitios.

export type EntradaNav = { href: string; tab?: string }

/** La ruta de un href, sin `?query` — `usePathname()` nunca devuelve la query. */
export function rutaDe(href: string): string {
  return href.split('?')[0]
}

/**
 * Activo por ruta, comparando SEGMENTOS COMPLETOS: `/sivra/pricing` cubre `/sivra/pricing/x`
 * pero NO `/sivra/pricing-auto`. La barra es lo que separa un hijo de un hermano homónimo.
 */
export function activoPorRuta(href: string, path: string): boolean {
  const r = rutaDe(href)
  return path === r || path.startsWith(r + '/')
}

/**
 * Activo dentro de una lista donde varias entradas comparten ruta y se distinguen por `?tab=`
 * (los cinco segmentos de `/banca`).
 *
 * La entrada CON `tab` gana cuando el `?tab=` de la URL coincide. La entrada SIN `tab` que
 * comparte ruta con segmentos es el padre («Inicio»): manda en sus subrutas y en la ruta pelada,
 * pero se apaga en cuanto un segmento hermano reclama el `?tab=` actual. Un `?tab=` desconocido
 * no lo reclama nadie, así que vuelve al padre en vez de dejar el menú entero apagado.
 */
export function activoEnLista(entrada: EntradaNav, lista: EntradaNav[], path: string, tabActual: string | null): boolean {
  const ruta = rutaDe(entrada.href)
  if (entrada.tab !== undefined) return path === ruta && (tabActual || '') === entrada.tab
  if (!activoPorRuta(entrada.href, path)) return false
  if (path !== ruta) return true // subruta propia: no hay segmento que discuta
  const hermanos = lista.filter(n => n.tab !== undefined && rutaDe(n.href) === ruta)
  return !hermanos.some(n => n.tab === (tabActual || ''))
}
