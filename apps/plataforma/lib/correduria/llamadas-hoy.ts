// Las llamadas del día DENTRO del aviso de renovaciones de las 08:30 (27/09/2026). Alberto pidió menos
// avisos, así que no es un mensaje nuevo: va en el que ya recibe. Puro (sin BD ni red).
import type { TareaDeHoy } from '../seguimiento-asegura.ts'

/** Markdown de Telegram: fuera los caracteres que abren formato (un nombre con «_» rompería el mensaje). */
const plano = (s: string) => s.replace(/[*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * `null` = nada que añadir. `leidas: null` = no se pudieron leer, y eso SE DICE: callar sería afirmar
 * que hoy no hay llamadas.
 */
export function bloqueLlamadasHoy(tareas: readonly TareaDeHoy[] | null, hoy: string, max = 8): string | null {
  if (tareas === null) return '📞 *Tareas de hoy*\nNo he podido leerlas: esto NO significa que no haya. Pregúntame «¿qué tengo hoy?».'
  if (tareas.length === 0) return null
  const orden = [...tareas].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))
  const lineas = orden.slice(0, max).map((t) => {
    const atrasada = t.fechaLimite < hoy ? ' ⚠️ atrasada' : ''
    const quien = plano(t.cliente ?? 'cliente sin nombre')
    const que = plano(t.observaciones).slice(0, 80)
    return `• ${quien}${t.ramo ? ` (${plano(t.ramo)})` : ''}: ${que}${atrasada}`
  })
  if (orden.length > max) lineas.push(`… y ${orden.length - max} más`)
  return [`📞 *Tareas de hoy (${orden.length})*`, ...lineas, 'Cuéntame por voz o por escrito cómo fue cada llamada y la registro.'].join('\n')
}
