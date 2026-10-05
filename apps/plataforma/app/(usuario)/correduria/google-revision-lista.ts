// Estado de la lista de la cola de revisión de Google Contacts (05/10/2026). Puro, con test.
//
// «Ver más» de 50 en 50 por CURSOR (`siguiente` del puerto). Lo que hay que evitar:
//   · que una tarjeta resuelta reaparezca al cargar la página siguiente (se deduplica por id);
//   · que «Ver más» DESAPAREZCA porque se resolvieron todas las cargadas mientras quedan más en
//     el servidor (se decide por `siguiente`, nunca por «la lista está vacía» ni por un recuento).

export type TarjetaRevision = { id: string }

export type ListaRevision<T extends TarjetaRevision> = {
  tarjetas: T[]
  /** Cursor para la página siguiente; `null` = el servidor dijo que no hay más. */
  siguiente: string | null
  /** Total pendiente según el servidor (menos lo resuelto aquí desde entonces). */
  pendientes: number
}

export function primeraPagina<T extends TarjetaRevision>(p: { revisiones: T[]; siguiente: string | null; pendientes: number }): ListaRevision<T> {
  return { tarjetas: p.revisiones, siguiente: p.siguiente, pendientes: p.pendientes }
}

export function anadirPagina<T extends TarjetaRevision>(l: ListaRevision<T>, p: { revisiones: T[]; siguiente: string | null; pendientes: number }): ListaRevision<T> {
  const ya = new Set(l.tarjetas.map((t) => t.id))
  return { tarjetas: [...l.tarjetas, ...p.revisiones.filter((t) => !ya.has(t.id))], siguiente: p.siguiente, pendientes: p.pendientes }
}

export function quitarResuelta<T extends TarjetaRevision>(l: ListaRevision<T>, id: string): ListaRevision<T> {
  if (!l.tarjetas.some((t) => t.id === id)) return l
  // El cursor NO se toca: el puerto pagina por (creado_en, id) de esa fila aunque ya no esté pendiente.
  return { ...l, tarjetas: l.tarjetas.filter((t) => t.id !== id), pendientes: Math.max(0, l.pendientes - 1) }
}

export function hayMas(l: ListaRevision<TarjetaRevision>): boolean {
  return l.siguiente !== null
}
