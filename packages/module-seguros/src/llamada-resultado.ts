// Modo llamada (Fase 1 de ASegura OS, pieza 1-3): qué deja escrito cada
// resultado de una llamada a un lead. Puro: asegura lo aplica en UNA
// transacción (registro de la llamada + cambio de estado + siguiente tarea),
// para que un clic no deje la mitad hecha.
//
// Regla de la casa: nada queda sin siguiente paso. «No contesta» no crea tarea
// porque la secuencia (`siguientePasoLead`) ya calcula la siguiente con el
// intento sumado; los demás resultados dejan la suya.

import { MOTIVOS_PERDIDA, validarTarea, type EstadoOportunidad, type PeticionAccion, type TareaValida } from './oportunidad-seguimiento.ts'

export const RESULTADOS_LLAMADA = ['quiere_precio', 'otro_dia', 'no_contesta', 'no_interesa'] as const
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number]

/**
 * Prefijo del registro de una llamada que SÍ cogió. Lo lee la lista de leads
 * para saber que respondió (y no mandarle otro recordatorio como a quien
 * nunca contesta): cambiarlo sin cambiar esa consulta lo rompe en silencio.
 */
export const PREFIJO_LLAMADA_CONTESTADA = 'Llamada contestada:'
export const PREFIJO_LLAMADA_SIN_RESPUESTA = 'Llamada sin respuesta'

/** Hasta cuándo se puede dejar pedida una rellamada: más allá ya no es «otro día». */
export const MAX_DIAS_RELLAMADA = 60
/** «No le interesa» aparca hasta el año que viene: vuelve sola a su próximo aniversario. */
export const DIAS_APARCAR_NO_INTERESA = 365
/** Días para preparar la comparativa que pidió. */
export const DIAS_PREPARAR_PRECIO = 2

export type PlanLlamada = {
  resultado: ResultadoLlamada
  /** Texto del registro de la llamada (tarea `llamada` que nace cerrada). */
  registro: string
  /** Cambio de estado que provoca, o `null` si no cambia nada. */
  accion: PeticionAccion | null
  /** Siguiente tarea con fecha, o `null` si la pone la secuencia. */
  siguiente: TareaValida | null
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

function masDias(hoy: Date, n: number): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + n))
  return d.toISOString().slice(0, 10)
}

function diasHastaFecha(fecha: string, hoy: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const t = Date.parse(`${fecha}T00:00:00Z`)
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== fecha) return null
  return Math.round((t - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / 86_400_000)
}

export function planLlamada(
  p: { resultado?: unknown; nota?: unknown; volverEl?: unknown; motivo?: unknown },
  estado: EstadoOportunidad,
  hoy: Date,
): { ok: true; plan: PlanLlamada } | { ok: false; motivo: string } {
  if (estado === 'ganada' || estado === 'perdida') {
    return { ok: false, motivo: `Esta oportunidad ya está ${estado}: reábrela antes de registrar llamadas.` }
  }
  const resultado = RESULTADOS_LLAMADA.find(r => r === p.resultado)
  if (!resultado) return { ok: false, motivo: `Resultado de llamada no válido (uno de: ${RESULTADOS_LLAMADA.join(', ')}).` }
  const nota = texto(p.nota, 500)
  const conNota = (t: string) => (nota ? `${t} — ${nota}` : t)

  switch (resultado) {
    case 'quiere_precio': {
      const t = validarTarea(
        { tipo: 'tarea', prioridad: 'alta', observaciones: conNota('Preparar la comparativa que pidió por teléfono'), fechaLimite: masDias(hoy, DIAS_PREPARAR_PRECIO) },
        hoy,
      )
      if (!t.ok) return t
      return {
        ok: true,
        plan: {
          resultado,
          registro: conNota(`${PREFIJO_LLAMADA_CONTESTADA} quiere precio`),
          // Solo «por contactar» pasa a «interesado»: si ya lo estaba o tiene
          // propuesta enviada, no se retrocede su estado.
          accion: estado === 'competencia' ? { accion: 'interesado' } : null,
          siguiente: t.tarea,
        },
      }
    }
    case 'otro_dia': {
      const volverEl = typeof p.volverEl === 'string' ? p.volverEl : ''
      const dias = diasHastaFecha(volverEl, hoy)
      if (dias === null) return { ok: false, motivo: 'Di qué día hay que volver a llamarle (aaaa-mm-dd).' }
      if (dias < 1) return { ok: false, motivo: 'La rellamada tiene que ser a partir de mañana.' }
      if (dias > MAX_DIAS_RELLAMADA) return { ok: false, motivo: `Más de ${MAX_DIAS_RELLAMADA} días no es «otro día»: aparca la oportunidad.` }
      const t = validarTarea({ tipo: 'llamada', prioridad: 'media', observaciones: conNota('Volver a llamar: lo pidió él'), fechaLimite: volverEl }, hoy)
      if (!t.ok) return t
      return { ok: true, plan: { resultado, registro: conNota(`${PREFIJO_LLAMADA_CONTESTADA} pide que le llamen otro día`), accion: null, siguiente: t.tarea } }
    }
    case 'no_contesta':
      return { ok: true, plan: { resultado, registro: conNota(PREFIJO_LLAMADA_SIN_RESPUESTA), accion: null, siguiente: null } }
    case 'no_interesa': {
      const motivo = MOTIVOS_PERDIDA.find(m => m === p.motivo)
      if (!motivo) return { ok: false, motivo: `Di por qué no le interesa (uno de: ${MOTIVOS_PERDIDA.join(', ')}).` }
      if (motivo === 'otro' && !nota) return { ok: false, motivo: 'Con motivo «otro», explica cuál en la nota.' }
      return {
        ok: true,
        plan: {
          resultado,
          registro: conNota(`${PREFIJO_LLAMADA_CONTESTADA} no le interesa (${motivo})`),
          accion: { accion: 'aparcar', aparcadaHasta: masDias(hoy, DIAS_APARCAR_NO_INTERESA), detalle: conNota(`No le interesa (motivo: ${motivo})`) },
          siguiente: null,
        },
      }
    }
  }
}
