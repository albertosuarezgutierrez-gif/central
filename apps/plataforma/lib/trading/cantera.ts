// 🌱 Cantera (capa C) — puente radar → watchlist. El radar semanal detecta los valores SOSTENIDOS
// en su top-10 y los PROPONE por Telegram con botones ✅/❌; solo el ✅ de Alberto da el alta en
// `trading_watchlist` (capa C). Es DESCUBRIMIENTO, no cambio del modelo: no toca ranking, pesos ni
// cestas, así que no pasa por el preregistro. Módulo PURO (sin BD) — testeable con node --test.

export type SnapshotTop = { fecha: string; top: string[] }
export type CandidatoCantera = { simbolo: string; semanas: number }

/** Semanas mínimas seguidas en el top-10 para proponerse (2 = "no es un one-hit de un lunes"). */
export const CANTERA_SEMANAS_MIN = 2
/** Tope de propuestas por digest — el lunes no puede ser un bombardeo de botones. */
export const CANTERA_MAX_PROPUESTAS = 3

/**
 * Candidatos a capa C: símbolos presentes en el top de los ÚLTIMOS `semanasMin` snapshots
 * consecutivos (incluido el más reciente), que no estén ya en la watchlist ni tengan propuesta
 * previa (pendiente o decidida — un ❌ no se re-pregunta). `snapshots` ordenados por fecha ASC.
 * Devuelve en el orden del top más reciente, con las semanas seguidas que lleva cada uno.
 */
export function candidatosCantera(
  snapshots: SnapshotTop[],
  enWatchlist: Set<string>,
  yaPropuestos: Set<string>,
  semanasMin: number = CANTERA_SEMANAS_MIN,
): CandidatoCantera[] {
  if (snapshots.length < semanasMin) return []
  const ultimo = snapshots[snapshots.length - 1]
  const out: CandidatoCantera[] = []
  for (const simbolo of ultimo.top) {
    if (enWatchlist.has(simbolo) || yaPropuestos.has(simbolo)) continue
    let semanas = 0
    for (let i = snapshots.length - 1; i >= 0 && snapshots[i].top.includes(simbolo); i--) semanas++
    if (semanas >= semanasMin) out.push({ simbolo, semanas })
  }
  return out
}

/** Guarda del callback de Telegram: un símbolo de ticker plausible, nada más. */
export function simboloValido(s: string): boolean {
  return /^[A-Z0-9.\-]{1,10}$/.test(s)
}
