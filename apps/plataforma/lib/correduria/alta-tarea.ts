/**
 * Validación PURA del alta rápida de tarea («Nueva tarea»). Devuelve la PRIMERA razón por la que
 * todavía no se puede guardar, en castellano, o `null` si está lista. Antes el botón «Guardar tarea» se
 * quedaba `disabled` sin decir por qué (typo el cliente en el buscador, sin pulsar su nombre en la lista =
 * fallo mudo, 05/11/2026): ahora el botón se pulsa siempre y la razón se MUESTRA.
 */
export function motivoAltaTarea(d: { clienteId: string | null | undefined; que: string; fecha: string }): string | null {
  if (!d.clienteId) return 'Falta elegir el cliente: pulsa «Buscar» y toca su nombre en la lista.'
  if (d.que.trim() === '') return 'Di qué hay que hacer.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return 'Falta la fecha.'
  return null
}

/** Evento de ventana con el que la cabecera avisa a Mi mesa de que se guardó una tarea (recarga sin desmontar). */
export const EVENTO_TAREA_GUARDADA = 'correduria:tarea-guardada'
