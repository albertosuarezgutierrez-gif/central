// ────────────────────────────────────────────────────────────────────────────
// Parámetros de coste POR CUENTA: hoy, cómo se financia la operación.
//
// El coste del dinero (art. 670 LEC: 40 días para consignar, sin hipoteca
// posible sobre un inmueble que aún no es tuyo) no se puede inventar — un
// puente que no existe falsearía el coste tanto como ignorarlo. Por eso se
// declara una vez en ⚙️ Criterios y se aplica a TODAS las vistas de esa cuenta.
//
// Sin `financia_pct` declarado se devuelve `{}` y el coste se calcula
// exactamente como hasta ahora, sin coste del dinero.
// ────────────────────────────────────────────────────────────────────────────
import type { ParamsCoste } from '@central/module-subastas'

/** Fila de `subastas_criterios` (solo las columnas de financiación). */
export interface FilaFinanciacion {
  financia_pct?: unknown
  financia_tipo_anual?: unknown
  financia_meses?: unknown
  financia_comision?: unknown
}

/**
 * Traduce la fila de criterios a `ParamsCoste`. Puro: la cuenta ya viene leída
 * (todas las pantallas que lo necesitan ya consultan `subastas_criterios`, así
 * que esto no añade ni una query).
 */
export function paramsCoste(f: FilaFinanciacion | null | undefined): ParamsCoste {
  const pct = num(f?.financia_pct)
  const tipo = num(f?.financia_tipo_anual)
  // Sin porcentaje financiado o sin tipo NO hay puente que computar.
  if (pct == null || pct <= 0 || tipo == null || tipo <= 0) return {}

  const meses = num(f?.financia_meses)
  const comision = num(f?.financia_comision)
  return {
    financiacion: {
      pctFinanciado: Math.min(1, pct),
      tipoAnual: tipo,
      ...(meses != null && meses > 0 ? { meses } : {}),
      ...(comision != null && comision > 0 ? { comisionApertura: comision } : {}),
    },
  }
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
