// Radar de sectores (agregación pura). Fase 1: agrega por PROVINCIA (dimensión disponible en BORME).
// Devuelve, por clave, conteos y una posición en el mapa de cuadrantes crecimiento × dificultad.
// El 'crecimiento' es una aproximación Fase 1 (sin INE); se sustituye por el índice real en Fase 2.
import type { TipoEvento } from './borme'

export interface FilaRadar {
  clave: string
  tipo: TipoEvento
}
export interface PuntoRadar {
  clave: string
  constituciones: number
  concursos: number
  disoluciones: number
  dificultad: number
  crecimiento: number
  cuadrante: 'caza' | 'declive' | 'sano' | 'ignorar'
}

export function agregarRadar(filas: FilaRadar[]): PuntoRadar[] {
  const m = new Map<string, { con: number; co: number; di: number }>()
  for (const f of filas) {
    const g = m.get(f.clave) ?? { con: 0, co: 0, di: 0 }
    if (f.tipo === 'concurso') g.co++
    else if (f.tipo === 'disolucion') g.di++
    // 'ampliacion_capital' y 'cese' son neutros para el radar de dificultad en Fase 1.
    m.set(f.clave, g)
  }
  return [...m.entries()].map(([clave, g]) => {
    const bajas = g.co + g.di
    const dificultad = bajas
    // Aproximación Fase 1: sin constituciones ingeridas, crecimiento ~ -bajas. En Fase 2 = índice INE.
    const crecimiento = g.con - bajas
    const cuadrante: PuntoRadar['cuadrante'] =
      crecimiento > 0 ? (dificultad > 0 ? 'caza' : 'sano') : dificultad > 0 ? 'declive' : 'ignorar'
    return { clave, constituciones: g.con, concursos: g.co, disoluciones: g.di, dificultad, crecimiento, cuadrante }
  })
}
