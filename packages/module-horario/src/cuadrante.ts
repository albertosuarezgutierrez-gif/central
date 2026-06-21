import type {
  TurnoFichaje, TurnoPrevisto, DesviacionCuadrante, ComparativaCuadrante,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

// Tolerancia (h) para considerar que previsto y real "cuadran".
const TOLERANCIA_H = 0.25

function horasReal(t: TurnoFichaje): number {
  if (t.horas_totales != null) return Number(t.horas_totales)
  if (!t.salida_at) return 0
  return (new Date(t.salida_at).getTime() - new Date(t.entrada_at).getTime()) / 3_600_000
}

// 'HH:MM' → horas decimales. Si fin <= inicio se asume que cruza medianoche (+24h).
function horasPrevisto(p: TurnoPrevisto): number {
  const min = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  let diff = min(p.hora_fin) - min(p.hora_inicio)
  if (diff <= 0) diff += 24 * 60
  return diff / 60
}

const k = (camareroId: string | null, fecha: string) => `${camareroId ?? '__sin__'}|${fecha}`

// Compara la planificación (turnos_previstos) con lo realmente fichado, por empleado y día.
export function compararPrevistoReal(
  previstos: TurnoPrevisto[],
  reales: TurnoFichaje[],
): ComparativaCuadrante {
  const prev = new Map<string, { nombre: string | null; camarero_id: string | null; fecha: string; horas: number }>()
  for (const p of previstos) {
    const key = k(p.camarero_id, p.fecha)
    const cur = prev.get(key) ?? { nombre: p.camarero_nombre, camarero_id: p.camarero_id, fecha: p.fecha, horas: 0 }
    cur.horas += horasPrevisto(p)
    prev.set(key, cur)
  }
  const real = new Map<string, { nombre: string | null; camarero_id: string | null; fecha: string; horas: number }>()
  for (const t of reales) {
    if (!t.salida_at) continue // solo turnos cerrados
    const key = k(t.camarero_id, t.fecha)
    const cur = real.get(key) ?? { nombre: t.camarero_nombre, camarero_id: t.camarero_id, fecha: t.fecha, horas: 0 }
    cur.horas += horasReal(t)
    real.set(key, cur)
  }

  const lineas: DesviacionCuadrante[] = []
  let horas_previstas_total = 0
  let horas_reales_total = 0
  for (const key of new Set([...prev.keys(), ...real.keys()])) {
    const p = prev.get(key)
    const r = real.get(key)
    const horas_previstas = round2(p?.horas ?? 0)
    const horas_reales = round2(r?.horas ?? 0)
    horas_previstas_total += horas_previstas
    horas_reales_total += horas_reales
    const desviacion = round2(horas_reales - horas_previstas)
    let estado: DesviacionCuadrante['estado']
    if (horas_previstas > 0 && horas_reales === 0) estado = 'no_show'
    else if (horas_previstas === 0 && horas_reales > 0) estado = 'sin_planificar'
    else if (Math.abs(desviacion) <= TOLERANCIA_H) estado = 'ok'
    else estado = desviacion > 0 ? 'exceso' : 'defecto'
    lineas.push({
      camarero_id: (p ?? r)!.camarero_id,
      camarero_nombre: (p ?? r)!.nombre,
      fecha: (p ?? r)!.fecha,
      horas_previstas, horas_reales, desviacion, estado,
    })
  }
  lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.camarero_nombre ?? '').localeCompare(b.camarero_nombre ?? ''))
  return {
    lineas,
    horas_previstas_total: round2(horas_previstas_total),
    horas_reales_total: round2(horas_reales_total),
  }
}
