// Lectura PAGINADA de `/api/reservations/{id}/messages` de Smoobu. Módulo PURO (sin `@/`, sin red):
// recibe el lector de UNA página para poder probarlo con `node --test`.
//
// 🚨 Smoobu devuelve el hilo en páginas de 25, de MÁS ANTIGUO a más nuevo (`page`, `page_size`,
// `page_count`, `total_items`). Leer solo la primera deja fuera justo los mensajes NUEVOS en cuanto
// una reserva pasa de 25: caso fundacional (26/09/2026, reserva 150035011, Duplex Center) — con 27
// mensajes, las dos preguntas del huésped caían en la página 2, el agente veía como último un
// automático nuestro («How's everything going?») y salía por `host_ultimo_sin_pregunta` sin dejar
// rastro. El huésped se quedó sin respuesta sobre cómo entrar de noche.

/** Tope de páginas: 20 × 25 = 500 mensajes, muy por encima de cualquier estancia real. */
export const MAX_PAGINAS_MENSAJES = 20

type Pagina = { messages?: unknown; page_count?: unknown } | unknown[] | null | undefined

/**
 * Lee todas las páginas y devuelve los mensajes en orden. Devuelve `null` si CUALQUIER página
 * falla o viene con forma rara: un hilo a medias es peor que ninguno, porque su último mensaje
 * no es el último de verdad (que es exactamente el fallo que esto corrige).
 */
export async function leerTodasLasPaginas(
  leerPagina: (page: number) => Promise<Pagina>,
  maxPaginas = MAX_PAGINAS_MENSAJES,
): Promise<any[] | null> {
  const primera = await leerPagina(1).catch(() => null)
  if (Array.isArray(primera)) return primera // respuesta sin paginar (formato antiguo)
  if (!primera || !Array.isArray((primera as any).messages)) return null

  const total = Number((primera as any).page_count ?? 1)
  const paginas = Number.isFinite(total) && total >= 1 ? Math.min(Math.floor(total), maxPaginas) : 1
  const todos: any[] = [...(primera as any).messages]

  for (let p = 2; p <= paginas; p++) {
    const d = await leerPagina(p).catch(() => null)
    if (!d || Array.isArray(d) || !Array.isArray((d as any).messages)) return null
    todos.push(...(d as any).messages)
  }
  return todos
}
