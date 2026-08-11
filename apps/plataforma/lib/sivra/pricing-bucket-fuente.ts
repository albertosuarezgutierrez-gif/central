// lib/sivra/pricing-bucket-fuente.ts — de QUÉ corpus sale el bucket de mercado del motor.
//
// POR QUÉ (09/08/2026, auditoría `docs/AUDITORIA-2026-08-precios-dinamicos.md`). El bucket de
// `pricing/apply` excluía `corpus_clonado` pero NO miraba `fuente`, así que mezclaba en el mismo
// percentil los precios de ANUNCIO de Serper —que no distinguen la fecha— con las mediciones
// reales del conector de Booking. Medido ese día contra el corpus fiable, el objetivo se movía
// **+24% en septiembre** y **−13% en octubre**; la dirección cara es la segunda, porque hunde el
// precio justo en el mejor mes de Sevilla (la queja histórica «octubre salía al precio de enero»).
//
// 🚨 Y aun así NO se puede filtrar a secas. Ese mismo día el corpus fiable solo alcanzaba las 3
// fechas que exige `MIN_FECHAS_MES` en sep/oct/nov; de diciembre en adelante tenía 1-2, así que un
// filtro duro habría dejado 5 de 9 meses SIN bucket → al ancla global, que es peor que la mezcla.
// De ahí la regla de abajo: el fiable manda solo cuando por sí mismo se gana el sitio.
//
// Módulo PURO (sin Prisma ni `@/`) para poder ejercitarlo con `node --test`: la lección del
// `?max=abc` es que la lógica que no se puede ejecutar en un test es justo donde se esconden los
// fallos mudos.

/** Fuentes cuyo precio está medido PARA ESA FECHA. Espejo de `FUENTES_FIABLES` de la cobertura. */
export const FUENTES_FIABLES_BUCKET = ['booking_mcp', 'manual'] as const

export type OrigenBucket = 'fiable' | 'mixto'

/** Un percentil ya calculado sobre un subconjunto del corpus. `med` a `null` = subconjunto vacío. */
export type Candidato<T> = { valores: T | null; n: number; fechas: number }

export type EleccionBucket<T> = { valores: T; n: number; fechas: number; fuente: OrigenBucket }

/**
 * Elige entre el percentil del corpus FIABLE y el de la MEZCLA.
 *
 * Regla, en una frase: **el fiable manda solo si por sí mismo pasa el mismo umbral que se le exige
 * a la mezcla**. Consecuencias buscadas:
 *   · nunca se queda un bucket sin datos por culpa de esta preferencia (el peor caso es la mezcla,
 *     que es exactamente el comportamiento anterior al cambio);
 *   · la elegibilidad del mes NO puede empeorar: si el fiable gana, ya cumple `minN`/`minFechas`;
 *   · y el resultado dice de dónde sale, porque un objetivo que no declara su procedencia es
 *     indistinguible de uno medido.
 *
 * `minFechas` se omite en el bucket por FECHA EXACTA (ahí todas las filas son del mismo día).
 */
export function elegirBucket<T>(
  fiable: Candidato<T>,
  mezcla: Candidato<T>,
  minN: number,
  minFechas = 0,
): EleccionBucket<T> | null {
  if (fiable.valores != null && fiable.n >= minN && fiable.fechas >= minFechas) {
    return { valores: fiable.valores, n: fiable.n, fechas: fiable.fechas, fuente: 'fiable' }
  }
  if (mezcla.valores == null) return null
  return { valores: mezcla.valores, n: mezcla.n, fechas: mezcla.fechas, fuente: 'mixto' }
}
