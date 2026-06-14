// Scoring / ranking de limpiadoras (lógica PURA, testeable con `node --test`).
// Sin red ni BD: se alimenta de filas de la vista `rendimiento_limpiadoras`.
//
// Diseño anclado a los DATOS REALES de la vista:
//  - `sesiones_completadas` viene ~0 para casi todas (la columna no se está
//    poblando de forma fiable) → NO se usa como señal (penalizaría a todas).
//  - `rating_medio` suele ser null (pocas evaluaciones) → no se penaliza a 0 a
//    quien no tiene valoraciones; se marca `sin_valoraciones` y baja la confianza.
// Señales usadas: calidad (rating) + fiabilidad (ratio de quejas) + volumen.

export type RendimientoLimpiadora = {
  limpiadora_id: string
  limpiadora_nombre: string | null
  total_sesiones: number
  total_quejas: number
  rating_medio: number | null // 0..5
}

export type LimpiadoraPuntuada = {
  limpiadora_id: string
  nombre: string
  score: number // 0..100
  desglose: {
    calidad: number | null // 0..1 (rating/5); null si sin valoraciones
    fiabilidad: number // 0..1 (1 − ratio de quejas)
  }
  total_sesiones: number
  total_quejas: number
  rating_medio: number | null
  sin_valoraciones: boolean
  confianza: 'alta' | 'media' | 'baja'
  posicion: number
}

// Pesos cuando HAY valoraciones (suman 1). Sin rating, el score = fiabilidad×100.
export const PESO_CALIDAD = 0.55
export const PESO_FIABILIDAD = 0.45

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function confianzaPorVolumen(totalSesiones: number): 'alta' | 'media' | 'baja' {
  if (totalSesiones >= 20) return 'alta'
  if (totalSesiones >= 8) return 'media'
  return 'baja'
}

/** Puntúa UNA limpiadora (sin posición). */
export function puntuarLimpiadora(r: RendimientoLimpiadora): Omit<LimpiadoraPuntuada, 'posicion'> {
  const totalSesiones = Math.max(0, r.total_sesiones ?? 0)
  const totalQuejas = Math.max(0, r.total_quejas ?? 0)
  const ratioQuejas = totalSesiones > 0 ? totalQuejas / totalSesiones : 0
  const fiabilidad = clamp01(1 - ratioQuejas)

  const tieneRating = typeof r.rating_medio === 'number' && !Number.isNaN(r.rating_medio)
  const calidad = tieneRating ? clamp01((r.rating_medio as number) / 5) : null

  const score01 = tieneRating ? (calidad as number) * PESO_CALIDAD + fiabilidad * PESO_FIABILIDAD : fiabilidad
  return {
    limpiadora_id: r.limpiadora_id,
    nombre: r.limpiadora_nombre?.trim() || 'Sin nombre',
    score: Math.round(score01 * 100),
    desglose: { calidad, fiabilidad },
    total_sesiones: totalSesiones,
    total_quejas: totalQuejas,
    rating_medio: tieneRating ? (r.rating_medio as number) : null,
    sin_valoraciones: !tieneRating,
    confianza: confianzaPorVolumen(totalSesiones),
  }
}

/** Ranking ordenado (score desc; desempata por nº de sesiones desc) con posición 1..n. */
export function rankingLimpiadoras(filas: RendimientoLimpiadora[]): LimpiadoraPuntuada[] {
  return filas
    .map(puntuarLimpiadora)
    .sort((a, b) => b.score - a.score || b.total_sesiones - a.total_sesiones)
    .map((l, i) => ({ ...l, posicion: i + 1 }))
}
