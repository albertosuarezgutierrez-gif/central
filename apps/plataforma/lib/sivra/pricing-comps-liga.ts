// ¿Este comparable juega en NUESTRA liga? Filtro de corpus por CALIDAD.
//
// ── POR QUÉ (03/09/2026) ─────────────────────────────────────────────────────────────────────
// El motor ancla el precio a un percentil del corpus de comparables de cada piso. Ese corpus se
// filtraba por plausibilidad €/plaza (`pricing-comps-plausibles.ts`) y por nada más: **la nota no
// se miraba**. El `score` solo se usaba para la mediana que alimenta el factor de calidad, sin
// ningún `WHERE` encima. O sea: se elegía "el mercado" sin preguntar si ese mercado nos admite.
//
// Lo que eso producía, medido el 03/09/2026 sobre el corpus real de 120 días:
//
//     piso            nuestra nota   mediana de sus comps   comps que puntúan MEJOR que él
//     Busto Reform         6,9              8,8              1.961 de 1.961  (el 100%)
//     Luxury Busto         7,2              8,7              1.798 de 1.826  (98,5%)
//     Duplex Center        7,6              8,7              1.762 de 1.788  (98,5%)
//     House Sevillana      8,4              8,7              1.258 de 1.750  (72%)
//
// En el corpus de Busto —un apartamento de 2 plazas puntuado 6,9— entraban Mercer Residences
// (409€/noche, 9,1), Palacio Bucarelli (243€, 9,1) y Singular Metropol (223€, 8,8). Eso no es su
// competencia: es el techo del mercado sevillano. Y el motor tomaba el percentil 55 de ese
// conjunto y solo podía descontar un 10% por calidad (el clamp de `quality_factor`), así que
// listaba a ×1,6-3,1 el precio al que ese piso se ha vendido en su vida.
//
// El resultado se ve en la ocupación a 180 días: House —el único cuya nota está a 0,3 de sus
// comps— al 23,2%; los otros tres al 6,6-11,6%.
//
// ── LA REGLA, Y POR QUÉ ES ASIMÉTRICA ────────────────────────────────────────────────────────
// Se descarta un comparable SOLO con prueba positiva de que está fuera de nuestra liga: nota
// CREÍBLE y más de `MAX_VENTAJA_NOTA` por encima de la nuestra. Los tres «no lo sé» se quedan:
//
//   · `score IS NULL`  → no sabemos si es mejor. No lo sé no autoriza a descartar (misma
//     convención que la plausibilidad por aforo: «sin aforo declarado el comp NO se juzga»).
//   · pocas reseñas    → su nota no es una medición. Medido en el corpus de Busto: «The Zentral
//     Arroyo» entra 68 veces con un **10,0 basado en 6 reseñas**. Un 10,0 así no puede expulsar a
//     nadie… ni contar como nota de mercado (ver `sqlNotaCreible`).
//   · nota por DEBAJO  → un piso peor que el nuestro sí es competencia nuestra, y además es el
//     que marca el suelo real del mercado. Nunca se descarta por abajo.
//
// 🚨 Y no se descarta por PRECIO en ningún caso. Filtrar comps caros «porque son caros» sería
// decidir el resultado antes de medirlo: el corpus dejaría de ser el mercado y pasaría a ser un
// espejo de lo que ya creemos. Lo que se filtra es la LIGA (una propiedad del comparable), y que
// el precio baje es la consecuencia, no el criterio.
//
// ── EFECTO MEDIDO DEL FILTRO (03/09/2026, corpus de 30 días) ─────────────────────────────────
//     piso            comps antes → después   fechas cubiertas   p50 antes → después
//     Busto Reform      1.980 → 270                111            134€ → 117€
//     Luxury Busto      1.896 → 492                125            209€ → 148€
//     Duplex Center     1.866 → 898                140            155€ → 136€
//     House Sevillana   1.788 → 1.713              141            518€ → 512€
//
// Que a House apenas le mueva la mediana es la comprobación de que el filtro hace lo que dice:
// House ya estaba en su liga y el corpus lo confirma; a los otros tres les quita justo el tramo
// que nunca fue su competencia. Y quedan ≥111 fechas en los cuatro, muy por encima de las 15 que
// exige `MIN_FECHAS_ANCLA`, así que el ancla acumulada no se queda sin apoyo.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/**
 * Cuánta nota de más puede tener un comparable y seguir siendo competencia nuestra.
 *
 * 1,0 punto de Booking no es poco: separa al 6,9 del 8,8, que es la brecha que teníamos abierta.
 * Más estrecho (0,5) dejaba a Busto con menos de 100 comps y lo habría dejado sin tarifar en
 * bastantes fechas; más ancho (1,5) no quitaba a Mercer Residences ni a Palacio Bucarelli del
 * corpus de un piso puntuado 6,9, que es justo lo que hay que quitar.
 */
export const MAX_VENTAJA_NOTA = 1.0

/**
 * Reseñas mínimas para que la nota de un comparable cuente como MEDICIÓN.
 *
 * Por debajo de esto la nota es ruido y no puede ni expulsar a un comp del corpus ni entrar en la
 * mediana de calidad del mercado. El caso que lo motivó tenía 6 reseñas y un 10,0.
 */
export const MIN_RESENAS_NOTA = 30

/** ¿La nota de este comparable es una medición y no una anécdota? */
export function notaCreible(
  score: number | null | undefined,
  reviewCount: number | null | undefined,
): boolean {
  return score != null && Number.isFinite(Number(score)) && Number(score) > 0
    && reviewCount != null && Number(reviewCount) >= MIN_RESENAS_NOTA
}

/**
 * ¿Entra este comparable en el corpus del piso?
 *
 * `true` salvo prueba positiva de lo contrario. Sin nuestra propia nota (`ownScore` nulo) no hay
 * con qué comparar y entran todos: no sabemos en qué liga jugamos.
 */
export function esCompDeNuestraLiga(
  scoreComp: number | null | undefined,
  reviewCount: number | null | undefined,
  ownScore: number | null | undefined,
  maxVentaja = MAX_VENTAJA_NOTA,
): boolean {
  if (ownScore == null || !Number.isFinite(Number(ownScore))) return true
  if (!notaCreible(scoreComp, reviewCount)) return true
  return Number(scoreComp) <= Number(ownScore) + maxVentaja
}

/**
 * La MISMA regla, como condición SQL. Úsala siempre en vez de escribirla a mano — hay cuatro
 * corpus distintos sobre `market_rates` (ancla de pasada, ancla acumulada, bucket de mes, bucket
 * de fecha) y que uno filtre distinto de otro significa dos definiciones de «comparable válido»
 * tarificando a la vez sin que nada falle. Es el motivo por el que existe `sqlCompPlausible()`.
 *
 * `prefijo` es el alias de la tabla con el punto puesto (`'m.'`) o cadena vacía. `exprOwnScore` es
 * la expresión SQL de NUESTRA nota (normalmente `'s.own_score'`). No interpola nada de fuera de
 * este módulo salvo esos dos alias, así que es seguro en `Prisma.raw`.
 */
export function sqlCompDeNuestraLiga(prefijo = '', exprOwnScore = 's.own_score'): string {
  const sc = `${prefijo}score`
  const rc = `${prefijo}review_count`
  return `(${exprOwnScore} IS NULL`
    + ` OR ${sc} IS NULL OR ${sc} <= 0`
    + ` OR ${rc} IS NULL OR ${rc} < ${MIN_RESENAS_NOTA}`
    + ` OR ${sc} <= ${exprOwnScore} + ${MAX_VENTAJA_NOTA})`
}

/**
 * Condición SQL para que la nota de un comparable entre en la MEDIANA de calidad del mercado
 * (`mkt_score`, la que alimenta `quality_factor`).
 *
 * Va aparte del filtro de corpus a propósito: son dos preguntas distintas. Un comp con 6 reseñas
 * sigue siendo competencia (su precio cuenta), pero su nota no mide nada y no debe mover la
 * mediana contra la que nos comparamos.
 */
export function sqlNotaCreible(prefijo = ''): string {
  const sc = `${prefijo}score`
  const rc = `${prefijo}review_count`
  return `(${sc} IS NOT NULL AND ${sc} > 0 AND ${rc} IS NOT NULL AND ${rc} >= ${MIN_RESENAS_NOTA})`
}
