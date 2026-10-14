/**
 * Tareas de una PÓLIZA o de un CLIENTE (14/10/2026), leídas del puerto de asegura
 * (`/api/operador/tareas`). Es la MISMA tabla de tareas de siempre (`gestiones`): una tarea suelta
 * colgada del cliente y, si es de una póliza, también de ella; por eso sale además en «Tareas sueltas»
 * de Mi mesa y se cierra por la misma vía. PURO (sin red) para poder probarlo con `node --test`.
 *
 * Tres estados: `ok` con lista vacía = no hay; `sin_configurar`/`error` = no se ha podido mirar (nunca «0»).
 */

import type { TipoTarea } from '@central/module-seguros'

export type TareaVinculada = {
  id: string
  tipo: string
  prioridad: string
  estado: string
  texto: string
  /** Fecha límite (Madrid, aaaa-mm-dd). `null` = sin fecha. */
  fecha: string | null
  polizaId: string | null
  polizaNumero: string | null
  /** Cuelga de una oportunidad: se gestiona desde ella, no con «Hecho» aquí. */
  oportunidadId: string | null
  origen: string | null
}

export type LecturaTareasVinculadas =
  | { estado: 'ok'; tareas: TareaVinculada[]; truncado: boolean; descartadas: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function interpretarTareasVinculadas(status: number, json: unknown): LecturaTareasVinculadas {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.tareas)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const tareas: TareaVinculada[] = []
  let descartadas = 0
  for (const v of o.tareas) {
    const r = objeto(v)
    const id = texto(r?.id)
    const tipo = texto(r?.tipo)
    const estado = texto(r?.estado)
    if (!r || !id || !tipo || !estado) { descartadas++; continue }
    tareas.push({
      id, tipo, estado,
      prioridad: texto(r.prioridad) ?? 'media',
      texto: typeof r.texto === 'string' ? r.texto : '',
      fecha: texto(r.fecha),
      polizaId: texto(r.polizaId),
      polizaNumero: texto(r.polizaNumero),
      oportunidadId: texto(r.oportunidadId),
      origen: texto(r.origen),
    })
  }
  return { estado: 'ok', tareas, truncado: o.truncado === true, descartadas }
}

export const abierta = (t: Pick<TareaVinculada, 'estado'>): boolean => t.estado !== 'cerrada'

/** Pendientes primero (por fecha, sin fecha al final); luego las cerradas en el orden en que llegan. */
export function ordenarTareasVinculadas(tareas: readonly TareaVinculada[]): TareaVinculada[] {
  const abiertas = tareas.filter(abierta)
  const cerradas = tareas.filter(t => !abierta(t))
  abiertas.sort((a, b) => {
    if (a.fecha !== b.fecha) {
      if (a.fecha === null) return 1
      if (b.fecha === null) return -1
      return a.fecha < b.fecha ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return [...abiertas, ...cerradas]
}

/** Texto de la baldosa: `null` si no se pudo leer (no se pinta, no es «0»). */
export function detalleTareas(l: LecturaTareasVinculadas): { texto: string; tono?: 'aviso' | 'malo' } | null {
  if (l.estado !== 'ok') return null
  const n = l.tareas.filter(abierta).length
  if (n === 0) return { texto: l.truncado ? 'hay más de las que se ven' : 'ninguna pendiente' }
  return { texto: `${n}${l.truncado ? '+' : ''} pendiente${n === 1 ? '' : 's'}`, tono: 'aviso' }
}

/**
 * Atajos de las gestiones más comunes del corredor. Rellenan título, tipo y plazo; todo se puede cambiar.
 * El tipo es el de la tabla (`tarea`/`llamada`/`email`/`whatsapp`), no uno nuevo.
 */
export const ATAJOS_TAREA = [
  { valor: 'suplemento', rotulo: 'Cambio/suplemento', tipo: 'tarea', dias: 2 },
  { valor: 'cuenta', rotulo: 'Cambio de cuenta bancaria', tipo: 'tarea', dias: 2 },
  { valor: 'llamar', rotulo: 'Llamar al cliente', tipo: 'llamada', dias: 1 },
  { valor: 'documentacion', rotulo: 'Pedir documentación', tipo: 'tarea', dias: 3 },
  { valor: 'renovacion', rotulo: 'Renovación', tipo: 'tarea', dias: 7 },
  { valor: 'otro', rotulo: 'Otro', tipo: 'tarea', dias: 3 },
] as const satisfies readonly { valor: string; rotulo: string; tipo: TipoTarea; dias: number }[]

export type AtajoTarea = (typeof ATAJOS_TAREA)[number]['valor']

export function atajo(v: string): (typeof ATAJOS_TAREA)[number] {
  return ATAJOS_TAREA.find(a => a.valor === v) ?? ATAJOS_TAREA[ATAJOS_TAREA.length - 1]
}

/** Título + descripción en el único campo de texto de la tarea (`observaciones`). `null` = falta el título. */
export function textoTarea(titulo: string, descripcion: string): string | null {
  const t = titulo.trim()
  if (t === '') return null
  const d = descripcion.trim()
  return (d === '' ? t : `${t}\n${d}`).slice(0, 2000)
}

/** Primera línea = título; el resto, descripción. */
export function partirTexto(texto: string): { titulo: string; descripcion: string | null } {
  const i = texto.indexOf('\n')
  if (i < 0) return { titulo: texto.trim(), descripcion: null }
  const d = texto.slice(i + 1).trim()
  return { titulo: texto.slice(0, i).trim(), descripcion: d === '' ? null : d }
}
