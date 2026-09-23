// packages/module-seguros/src/retencion-fuga.ts
//
// Flujo de retención (Fase 2 de ASegura OS, pieza 2-b). PURO.
//
// Cuando CIMA marca una póliza viva como `anula_al_vencimiento`, el cliente ha avisado de que se
// va, pero la póliza sigue en vigor hasta su vencimiento: todavía se le puede retener. Es el único
// evento de pérdida que llega A TIEMPO, así que no espera a que nadie lo revise: abre una
// oportunidad de retención con una llamada de prioridad alta para hoy.
//
// Una baja o una desaparición ya son hechos consumados: esas no abren nada, se revisan en «Hoy».

export const ORIGEN_RETENCION = 'retencion_cima'

export type EntradaRetencion = {
  tipo: string
  ramo: string | null
  compania: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD` o null. */
  vencimiento: string | null
  /** `YYYY-MM-DD`, hoy en Madrid. */
  hoy: string
}

export type DecisionRetencion =
  | { abrir: true; texto: string; diasRestantes: number | null }
  | { abrir: false; motivo: 'no_es_anulacion' | 'ya_vencida' }

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

export function decidirRetencion(e: EntradaRetencion): DecisionRetencion {
  if (e.tipo !== 'POLIZA_ANULA_AL_VENCIMIENTO') return { abrir: false, motivo: 'no_es_anulacion' }
  // Sin fecha no se sabe cuánto queda: se abre igual (NULL no es «ya vencida»), y se dice.
  const dias = e.vencimiento ? diasEntre(e.hoy, e.vencimiento) : null
  if (dias !== null && dias < 0) return { abrir: false, motivo: 'ya_vencida' }
  const poliza = [e.ramo, e.compania, e.numeroPoliza ? `nº ${e.numeroPoliza}` : null].filter(Boolean).join(' ') || 'su póliza'
  const cuando = e.vencimiento
    ? `vence el ${fechaEs(e.vencimiento)}${dias === 0 ? ' (hoy)' : ` (quedan ${dias} días)`}`
    : 'sin fecha de vencimiento en CIMA'
  return {
    abrir: true,
    diasRestantes: dias,
    texto: `Retener: CIMA marca ${poliza} como «anula al vencimiento» — ${cuando}. Llamar para saber por qué se va y ofrecer alternativa.`,
  }
}
