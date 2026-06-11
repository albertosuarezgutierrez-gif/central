// ────────────────────────────────────────────────────────────────────────────
// Presentación + plazos/subsanación (F6) — PURO. Aritmética de fechas ISO en
// UTC (días naturales del pliego), estado de presentación y subsanación en
// días hábiles. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  EstadoPresentacion,
  FichaConcurso,
  PlazoSubsanacion,
  SobresListos,
} from './types'

const MS_DIA = 86_400_000

/** Parsea 'YYYY-MM-DD' a epoch UTC de medianoche (NaN si no es válida). */
function epoch(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** ISO 'YYYY-MM-DD' de un epoch UTC. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días naturales entre dos fechas ISO (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((epoch(hasta) - epoch(desde)) / MS_DIA)
}

/**
 * Suma `dias` días HÁBILES (lun–vie) a una fecha ISO, saltando fines de semana.
 * No considera festivos (el pliego/órgano los precisa caso a caso).
 */
export function sumarDiasHabiles(desde: string, dias: number): string {
  let ms = epoch(desde)
  let restantes = dias
  while (restantes > 0) {
    ms += MS_DIA
    const dow = new Date(ms).getUTCDay() // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) restantes--
  }
  return iso(ms)
}

/**
 * Estado de presentación. El sobre TÉCNICO solo es requerido si hay criterios de
 * juicio de valor; el ECONÓMICO solo si hay criterio económico/automático; el
 * ADMINISTRATIVO siempre. `listo` exige plazo abierto y todos los requeridos.
 */
export function estadoPresentacion(
  ficha: FichaConcurso,
  hoy: string,
  sobres: SobresListos,
): EstadoPresentacion {
  const fin = ficha.plazos.fin_presentacion
  const dias_para_fin = fin ? diasEntre(hoy, fin) : null
  const plazo_abierto = dias_para_fin === null ? true : dias_para_fin >= 0
  const urgente = plazo_abierto && dias_para_fin !== null && dias_para_fin <= 3

  const requiereTecnico = ficha.criterios.some(c => c.tipo === 'juicio_valor')
  const requiereEconomico = ficha.criterios.some(c => c.sobre === 'economico' || c.tipo === 'automatico')

  const pendientes: string[] = []
  if (!plazo_abierto) pendientes.push('El plazo de presentación ya ha terminado')
  if (!sobres.administrativo) pendientes.push('Falta el sobre administrativo')
  if (requiereTecnico && !sobres.tecnico) pendientes.push('Falta el sobre técnico (memoria)')
  if (requiereEconomico && !sobres.economico) pendientes.push('Falta el sobre económico (oferta)')

  const listo = pendientes.length === 0
  return { dias_para_fin, plazo_abierto, urgente, listo, pendientes }
}

/**
 * Plazo de subsanación de defectos del sobre administrativo (art. 141 LCSP):
 * por defecto 3 días hábiles desde el requerimiento del órgano de contratación.
 */
export function plazoSubsanacion(fechaRequerimiento: string, diasHabiles = 3): PlazoSubsanacion {
  return { fecha_limite: sumarDiasHabiles(fechaRequerimiento, diasHabiles), dias_habiles: diasHabiles }
}
