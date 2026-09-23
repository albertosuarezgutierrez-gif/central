// packages/module-seguros/src/retencion-fuga.ts
//
// Flujo de retención (Fase 2 de ASegura OS, pieza 2-b). PURO.
//
// Una póliza que se anula ANTES de su vencimiento todavía se puede retener: abre una oportunidad de
// retención con una llamada de prioridad alta para hoy, sin esperar a que nadie la revise.
//
// 🚨 La ingesta de CIMA solo escribe `activa` (EV) o `cancelada` (AN) —`eiac-pol-mapper.ts` del
// repo `asegura`— y no guarda el fichero crudo: una anulación A VENCIMIENTO y una INMEDIATA llegan
// igual, como POLIZA_BAJA. Por eso una baja con el vencimiento aún por delante también abre, y el
// texto no afirma cuál de las dos es. `anula_al_vencimiento` se conserva por si algún día llega.
//
// Una desaparición, o una baja ya vencida o sin fecha, no abren nada: se revisan en «Hoy».

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
  | { abrir: false; motivo: 'no_es_anulacion' | 'ya_vencida' | 'sin_fecha' }

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

export function decidirRetencion(e: EntradaRetencion): DecisionRetencion {
  const anula = e.tipo === 'POLIZA_ANULA_AL_VENCIMIENTO'
  if (!anula && e.tipo !== 'POLIZA_BAJA') return { abrir: false, motivo: 'no_es_anulacion' }
  // «Anula al vencimiento» sin fecha se abre igual (NULL no es «ya vencida») y se dice. Una baja sin
  // fecha no: sin vencimiento no hay nada que diga que sigue en vigor.
  if (!e.vencimiento && !anula) return { abrir: false, motivo: 'sin_fecha' }
  const dias = e.vencimiento ? diasEntre(e.hoy, e.vencimiento) : null
  if (dias !== null && dias < 0) return { abrir: false, motivo: 'ya_vencida' }
  const poliza = [e.ramo, e.compania, e.numeroPoliza ? `nº ${e.numeroPoliza}` : null].filter(Boolean).join(' ') || 'su póliza'
  const cuando = e.vencimiento
    ? `vence el ${fechaEs(e.vencimiento)}${dias === 0 ? ' (hoy)' : ` (quedan ${dias} días)`}`
    : 'sin fecha de vencimiento en CIMA'
  const que = anula
    ? `CIMA marca ${poliza} como «anula al vencimiento» — ${cuando}.`
    : `CIMA da de baja ${poliza} y su vencimiento no ha llegado — ${cuando}. Si la anulación es a vencimiento, aún está en vigor.`
  return { abrir: true, diasRestantes: dias, texto: `Retener: ${que} Llamar para saber por qué se va y ofrecer alternativa.` }
}
