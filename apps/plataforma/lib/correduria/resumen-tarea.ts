// El titular de una tarea para las listas (Hoy, Inicio, Telegram). Puro.
//
// Las observaciones de una tarea llegan a veces como un párrafo entero en una sola línea (recibo
// devuelto: importe, motivo del banco, qué preguntar, plazo del art. 15 LCS…). En una lista eso son
// diez renglones por fila. Aquí se saca un titular corto y el resto queda como detalle: NO se pierde
// nada, el detalle es el texto completo cuando el titular lo ha recortado.

export type ResumenTarea = { titulo: string; detalle: string | null }

/** Cortes naturales de una frase: gana el que aparece ANTES. */
const CORTES = ['. ', ' (', ': ', ' — ', ' - ', '; ', ', ']

export function resumirTarea(observaciones: string | null | undefined, max = 90): ResumenTarea {
  const texto = (observaciones ?? '').trim()
  if (!texto) return { titulo: '', detalle: null }
  const saltos = texto.split('\n')
  const primera = saltos[0].trim()
  const resto = saltos.slice(1).join('\n').trim() || null
  if (primera.length <= max) return { titulo: primera, detalle: resto }

  // La primera frase ya es larga: se corta por el primer límite natural entre 20 y `max` caracteres.
  let corte = -1
  for (const c of CORTES) {
    const i = primera.indexOf(c, 20)
    if (i !== -1 && i <= max && (corte === -1 || i < corte)) corte = i
  }
  let titulo = corte !== -1 ? primera.slice(0, corte) : primera.slice(0, max).replace(/\s+\S*$/, '')
  titulo = titulo.replace(/[\s.,;:·—-]+$/, '')
  return { titulo: corte !== -1 ? titulo : `${titulo}…`, detalle: texto }
}
