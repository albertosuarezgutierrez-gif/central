// Propuesta de conciliación PURA: movimiento bancario ↔ partida pendiente (cobro 43x / pago 40x-41x) por importe EXACTO y ventana de
// fechas, o ↔ cuenta de gasto/ingreso por REGLA de concepto. Esto solo PROPONE: nada se asienta sin que el usuario confirme.
//
// Garantías (con test):
//   · importe exacto al céntimo y mismo sentido (abono ↔ cobro pendiente, cargo ↔ pago pendiente);
//   · si hay más de un candidato (o varios movimientos compiten por el mismo candidato) → `ambigua`: sin propuesta pre-elegida;
//   · un candidato NUNCA se propone a dos movimientos, y un movimiento a un solo candidato.

export type Candidato = {
  id: string
  sentido: 'cobro' | 'pago'
  /** Pendiente de cobro/pago en céntimos, siempre > 0. */
  importe: number
  /** Fecha de la partida (ISO). */
  fecha: string
  documento?: string | null
  cuenta?: string
  tercero?: string | null
}
export type MovimientoPorConciliar = { id: string; fecha: string; importe: number; concepto: string }
export type ReglaConcepto = { id: string; patron: string; cuenta: string; sentido: 'cargo' | 'abono' | 'ambos' }
export type Ventana = { /** Días que el movimiento puede ser ANTERIOR a la partida. */ antes: number; /** Días máx. que puede tardar el pago tras la partida. */ despues: number }
export const VENTANA_POR_DEFECTO: Ventana = { antes: 5, despues: 90 }

export type Propuesta =
  | { movimientoId: string; estado: 'propuesta'; metodo: 'importe_exacto'; candidatoId: string }
  | { movimientoId: string; estado: 'propuesta'; metodo: 'regla'; reglaId: string; cuenta: string }
  | { movimientoId: string; estado: 'ambigua'; candidatosIds: string[]; motivo: string }
  | { movimientoId: string; estado: 'sin_candidato' }

const dia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function reglasQueCasan(m: Pick<MovimientoPorConciliar, 'concepto' | 'importe'>, reglas: readonly ReglaConcepto[]): ReglaConcepto[] {
  const texto = normaliza(m.concepto)
  return reglas.filter((r) => {
    const p = normaliza(r.patron)
    if (!p || !texto.includes(p)) return false
    return r.sentido === 'ambos' || (r.sentido === 'cargo' ? m.importe < 0 : m.importe > 0)
  })
}

export function proponerConciliacion(
  movs: readonly MovimientoPorConciliar[], candidatos: readonly Candidato[], reglas: readonly ReglaConcepto[] = [], ventana: Ventana = VENTANA_POR_DEFECTO,
): Propuesta[] {
  // 1) candidatos exactos de cada movimiento
  const exactos = new Map<string, Candidato[]>()
  for (const m of movs) {
    const d = dia(m.fecha)
    exactos.set(m.id, m.importe === 0 || !Number.isFinite(d) ? [] : candidatos.filter((c) => {
      if (c.sentido !== (m.importe > 0 ? 'cobro' : 'pago') || c.importe !== Math.abs(m.importe)) return false
      const dc = dia(c.fecha)
      return Number.isFinite(dc) && d >= dc - ventana.antes && d <= dc + ventana.despues
    }))
  }
  // 2) cuántos movimientos compiten por cada candidato
  const compiten = new Map<string, number>()
  for (const lista of exactos.values()) for (const c of lista) compiten.set(c.id, (compiten.get(c.id) ?? 0) + 1)

  return movs.map((m): Propuesta => {
    const lista = exactos.get(m.id) ?? []
    if (lista.length === 1 && compiten.get(lista[0].id) === 1) return { movimientoId: m.id, estado: 'propuesta', metodo: 'importe_exacto', candidatoId: lista[0].id }
    if (lista.length > 0) {
      const motivo = lista.length > 1 ? `${lista.length} partidas pendientes con ese importe exacto` : 'otro movimiento del mismo importe compite por la misma partida'
      return { movimientoId: m.id, estado: 'ambigua', candidatosIds: lista.map((c) => c.id), motivo }
    }
    const casan = reglasQueCasan(m, reglas)
    if (casan.length === 1) return { movimientoId: m.id, estado: 'propuesta', metodo: 'regla', reglaId: casan[0].id, cuenta: casan[0].cuenta }
    if (casan.length > 1) return { movimientoId: m.id, estado: 'ambigua', candidatosIds: [], motivo: `${casan.length} reglas de concepto casan con este movimiento` }
    return { movimientoId: m.id, estado: 'sin_candidato' }
  })
}
