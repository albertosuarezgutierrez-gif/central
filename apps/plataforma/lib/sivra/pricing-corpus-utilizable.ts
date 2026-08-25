// Qué pasada de mercado es la que MANDA para cada piso.
//
// 🚨 La pasada más FRESCA no es la más informativa, y tomarla a ciegas deja pisos sin tarifar.
//
// Caso fundacional (22/08/2026, House Sevillana): el motor elegía el corpus con
// `SELECT scenario, MAX(search_date) FROM market_rates`, sin más condición. Ese día el barrido
// barato (`serper`) corrió y el conector bueno (`booking_mcp`) no, así que el MAX cayó en una
// pasada de 22 comparables de los cuales **1** sobrevivía al filtro de €/plaza — el resto eran
// apartamentos de 45-108€ etiquetados «aforo 12». Con 1 < MIN_SAMPLE el apply saltó el piso
// ENTERO (`skipped: datos_insuficientes`) y House no se tarificó en todo el día, justo el día en
// que el calibrado de canal acababa de moverlo de 1,20/0 a 1,0872/213,50€. Los otros tres pisos
// se libraron por casualidad: con 2, 4 y 5 plazas su umbral de €/plaza es tan bajo (24, 48 y 60€)
// que el ruido de serper lo pasa. Cuanto MÁS grande es el piso, más fácil le es caer.
//
// El corpus rico seguía ahí: la pasada del día anterior tenía 93 comparables plausibles. El fallo
// no era falta de datos, era que una pasada ilegible SOMBREABA a una legible — la misma familia
// que «un catch que devuelve [] no autoriza a afirmar que no hay nada», pero con un MAX() en vez
// de un catch.
//
// La cura: elegir la pasada más reciente que de verdad deje material con el que tarifar. Si
// ninguna lo deja, no se inventa nada — el piso cae igualmente en `datos_insuficientes`, que ahora
// además AVISA (ver el bloque `sinTarifar` de /api/sivra/pricing/apply).
//
// El tope de frescura NO se toca aquí: `MAX_MARKET_AGE_DAYS` sigue vigilando que la pasada elegida
// no sea vieja. Retroceder un día está bien; retroceder un mes lo sigue frenando el guardián de edad.
import { MIN_EUR_PLAZA_COMP } from './pricing-comps-plausibles.ts'

/** Mínimo de comparables plausibles para que una pasada sirva. Igual al MIN_SAMPLE del apply. */
export const MIN_COMPS_PASADA = 5

/**
 * Cuerpo del CTE `latest`: una fila por `scenario` con la última `search_date` que deja
 * al menos `MIN_COMPS_PASADA` comparables plausibles.
 *
 * Se devuelve como texto (no como `Prisma.sql`) para que este módulo siga siendo puro y testeable
 * con `node --test`. Va a `Prisma.raw`, y puede: no interpola NADA de fuera — solo las dos
 * constantes numéricas de este repo.
 */
export function sqlUltimaPasadaUtil(): string {
  return `
      SELECT scenario, MAX(search_date) AS sd FROM (
        SELECT scenario, search_date
        FROM market_rates
        WHERE scenario LIKE 'prop_%' AND price_night > 0
          -- Misma plausibilidad por €/plaza que aplica el percentil aguas abajo: si aquí no se
          -- filtrara, una pasada de puro ruido volvería a ganar el MAX y a dejar el piso sin precio.
          AND (guests IS NULL OR guests <= 0 OR price_night >= ${MIN_EUR_PLAZA_COMP} * guests)
        GROUP BY scenario, search_date
        HAVING COUNT(*) >= ${MIN_COMPS_PASADA}
      ) util
      GROUP BY scenario`
}

export type PisoSaltado = { property: string; sample_n: number; market_age_days: number }

/**
 * Texto del aviso cuando el motor deja pisos sin tarifar. `null` si no hay ninguno: un aviso que
 * salta siempre deja de leerse.
 *
 * Que un piso no se tarifique es CARO y hasta hoy era invisible — vivía solo en el array `results`
 * de la respuesta HTTP, que no lee nadie. Es hermano del aviso de eventos ilegibles: la pasada no
 * es inválida (los demás pisos sí se tarificaron), pero el hueco tiene que verse sin deducirlo.
 */
export function avisoPisosSinTarifar(saltados: PisoSaltado[], minSample: number, maxEdad: number): string | null {
  if (saltados.length === 0) return null
  const lineas = saltados.map((p) => {
    const motivo = p.sample_n < minSample
      ? `${p.sample_n} comparable(s) utilizables (hacen falta ${minSample})`
      : `mercado de hace ${p.market_age_days}d (máximo ${maxEdad})`
    return `• ${p.property.replace('prop_', '')}: ${motivo}`
  })
  return `⚠️ *Pricing: ${saltados.length} piso(s) NO se han tarificado esta pasada*\n\n` +
    lineas.join('\n') +
    `\n\nSus precios se quedan como estaban — no es que el mercado diga que están bien, es que no ` +
    `se ha podido mirar. Revisa que el conector de Booking (\`sivra_mercado_booking\`) haya corrido.`
}
