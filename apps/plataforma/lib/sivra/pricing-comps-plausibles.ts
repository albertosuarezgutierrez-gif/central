// Plausibilidad de un comparable de mercado por €/plaza. SUELO y TECHO.
//
// ── EL SUELO (17/08/2026) ────────────────────────────────────────────────────────────────────
// Un comp a 44-104€ "para 12 personas" no es un piso entero: es el precio de UNA habitación
// (o un anuncio sin fecha) que el buscador devuelve igualmente al pedir aforo 12. Detectado el
// 17/08/2026 en House (364 filas, 36 fechas, todas fuente='serper'): fichas sin reseñas a
// 3,7-8,7€/plaza conviviendo con el mercado real a 14-34€/plaza. Ese ruido entra en los
// percentiles del motor (que no filtraba plausibilidad) y puede hundir buckets mensuales.
//
// El umbral se aplica sobre el precio y aforo CRUDOS del comp (antes de normalizar por
// pricing_factor_aforo). Verificado contra el corpus real de los 4 pisos (17/08/2026): el comp
// legítimo más barato queda a 12,0-13,5€/plaza (busto 27€/2p · duplex 48€/4p · luxury 74€/5p ·
// house 149€/12p), así que 12€/plaza separa limpio sin comerse mercado flojo real.
//
// ── EL TECHO (29/08/2026) ────────────────────────────────────────────────────────────────────
// 🚨 La guarda era ASIMÉTRICA: cortaba por abajo y dejaba entrar cualquier cosa por arriba. En el
// corpus de House había un comp a 19.359€/noche (1.613€/plaza), medido dos veces. La mediana
// apenas lo nota —es robusta: 514€ -> 497€— pero el TECHO del motor sí: el percentil 90 pasaba de
// 992€ a 1.170€, un 18% de inflado. Ese p90 es el `ceil_pctl` que frena las subidas, así que el
// freno estaba puesto un 18% más arriba de donde el mercado lo justifica. No hacía daño con el
// precio lejos del techo; lo haría el día que una fecha caliente empujara hacia arriba.
//
// El número está MEDIDO, no elegido: sobre 6.479 comps fiables de los 4 pisos (120 días), el
// percentil 99 de €/plaza va de 193 (dúplex) a 306 (busto). 600€/plaza es 2-3x ese p99 y descarta
// 8 filas de 6.479 (0,12%). Para el piso de 2 plazas son 1.200€/noche y para House 7.200€: sigue
// siendo generoso para Feria o Semana Santa, que es cuando el mercado se dispara de verdad.
//
// Sin aforo declarado (NULL/0) el comp NO se juzga, ni por abajo ni por arriba: un «no lo sé» no
// autoriza a descartar.
export const MIN_EUR_PLAZA_COMP = 12
export const MAX_EUR_PLAZA_COMP = 600

export function esCompPlausible(precioNoche: number, plazasComp: number | null | undefined): boolean {
  if (plazasComp == null || plazasComp <= 0) return true
  if (!Number.isFinite(precioNoche) || precioNoche <= 0) return false
  return precioNoche >= MIN_EUR_PLAZA_COMP * plazasComp
    && precioNoche <= MAX_EUR_PLAZA_COMP * plazasComp
}

/**
 * La MISMA regla, como condición SQL. Úsala siempre en vez de escribirla a mano.
 *
 * 🚨 POR QUÉ EXISTE (29/08/2026). Al añadir el techo aparecieron 13 sitios que replicaban la
 * condición del suelo copiada literalmente. Trece sitios es trece oportunidades de que el próximo
 * cambio se aplique en doce: el corpus del ancla diría una cosa y el del bucket otra, y el motor
 * tarificaría con dos definiciones distintas de «comparable válido» sin que nada fallara. Es el
 * mismo motivo por el que `sqlCorpusAncla()` centraliza la definición del corpus.
 *
 * `prefijo` es el alias de la tabla con el punto ya puesto (`'m.'`) o cadena vacía. No interpola
 * nada de fuera: solo las dos constantes numéricas de este módulo, así que es seguro en Prisma.raw.
 */
export function sqlCompPlausible(prefijo = ''): string {
  const g = `${prefijo}guests`
  const p = `${prefijo}price_night`
  return `(${g} IS NULL OR ${g} <= 0 OR (${p} >= ${MIN_EUR_PLAZA_COMP} * ${g} AND ${p} <= ${MAX_EUR_PLAZA_COMP} * ${g}))`
}
