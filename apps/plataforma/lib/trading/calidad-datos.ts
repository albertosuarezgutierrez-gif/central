// 🛡️ GUARDIÁN de calidad de datos del universo (lección del 20/07/2026: MCD llegó al nº 1 del ranking
// porque la SEC trajo sus acciones sin escalar → mkt_cap de 196.044$ → earnings/FCF yield ×1e6, y el
// outlier contaminó los z-scores de valor de TODO el universo; lo cazamos porque Alberto pegó el digest
// y olió raro — pura suerte). Versión sistemática: ANTES de cada ranking se escanea la caché buscando
// IMPOSIBLES y los campos envenenados se neutralizan (→ null: esa empresa no puntúa ese factor esa
// semana) + línea 🛡️ en el digest. Umbrales pensados para un universo de LARGE-CAPS de EEUU — holgados
// a propósito: el superciclo de memoria (momentum reales de +4715%) NO debe saltar. Módulo PURO.

export type FilaCalidad = {
  simbolo: string
  precio?: number | null
  mktCap?: number | null
  earningsYield?: number | null
  fcfYield?: number | null
  momentum?: number | null
  roic?: number | null
}

export type CampoAnomalia = 'precio' | 'mktCap' | 'earningsYield' | 'fcfYield' | 'momentum' | 'roic'
export type Anomalia = { simbolo: string; campo: CampoAnomalia; valor: number; motivo: string }

// Umbrales de lo IMPOSIBLE (no de lo raro): fuera de esto el dato es basura, no una empresa extrema.
const LIMITES: Array<{ campo: CampoAnomalia; mal: (v: number) => boolean; motivo: string }> = [
  { campo: 'precio', mal: v => v <= 0, motivo: 'precio ≤ 0' },
  // Large-caps de EEUU: por debajo de 1.000 M$ o por encima de 10 billones (10e12) el dato está roto
  // (caso MCD: 196.044$). El techo deja margen ×2 sobre la mayor empresa del mundo.
  { campo: 'mktCap', mal: v => v < 1e9 || v > 1e13, motivo: 'capitalización fuera de rango' },
  { campo: 'earningsYield', mal: v => Math.abs(v) > 1, motivo: '|EBIT/EV| > 100%' },
  { campo: 'fcfYield', mal: v => Math.abs(v) > 1, motivo: '|FCF/mktCap| > 100%' },
  // +10.000% en 12 meses no lo ha hecho ni la manía de memoria (SNDK +4715% es real y pasa el umbral).
  { campo: 'momentum', mal: v => v > 100 || v < -0.99, motivo: 'retorno 12m imposible' },
  { campo: 'roic', mal: v => Math.abs(v) > 10, motivo: '|ROIC| > 1000%' },
]

// Escanea las filas de la caché → lista de anomalías (una por campo roto). No muta nada.
export function anomaliasUniverso(filas: FilaCalidad[]): Anomalia[] {
  const out: Anomalia[] = []
  for (const f of filas) {
    for (const { campo, mal, motivo } of LIMITES) {
      const v = f[campo]
      if (typeof v === 'number' && Number.isFinite(v) && mal(v)) out.push({ simbolo: f.simbolo, campo, valor: v, motivo })
      else if (typeof v === 'number' && !Number.isFinite(v)) out.push({ simbolo: f.simbolo, campo, valor: v, motivo: 'no numérico' })
    }
  }
  return out
}

// Mapa símbolo → campos envenenados (para neutralizarlos a null antes de rankear).
export function camposEnvenenados(anomalias: Anomalia[]): Map<string, Set<CampoAnomalia>> {
  const m = new Map<string, Set<CampoAnomalia>>()
  for (const a of anomalias) {
    if (!m.has(a.simbolo)) m.set(a.simbolo, new Set())
    m.get(a.simbolo)!.add(a.campo)
  }
  return m
}

// Escaneo + neutralización EN COPIA, en una llamada: los campos imposibles salen a null (esa empresa
// no puntúa ese factor) y las anomalías se devuelven para DECLARARLAS en la UI/digest. Todo consumidor
// de la caché `trading_universo` que puntúe o muestre debe pasar por aquí — el cron del radar ya lo
// hacía, pero el ranking+explorador de /trading leía la caché CRUDA y un ADR con los resultados en
// rupias (RDY, EY «682%») salió nº 1 con score 6,03 el 11/08/2026.
export function neutralizarUniverso<T extends FilaCalidad>(filas: T[]): { filas: T[]; anomalias: Anomalia[] } {
  const anomalias = anomaliasUniverso(filas)
  if (!anomalias.length) return { filas, anomalias }
  const envenenados = camposEnvenenados(anomalias)
  const limpias = filas.map(f => {
    const malos = envenenados.get(f.simbolo)
    if (!malos) return f
    const copia: T = { ...f }
    for (const campo of malos) (copia as FilaCalidad)[campo] = null
    return copia
  })
  return { filas: limpias, anomalias }
}
