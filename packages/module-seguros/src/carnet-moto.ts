// Carné de MOTO de la ficha para tarificar (19/10/2026). PURO. UNA sola regla para plataforma (completar el riesgo antes de
// encolar) y asegura (ficha del tomador que se entrega al bot): antes cada una elegía un carné distinto (plataforma el más
// antiguo; asegura el de mayor rango) y el mismo cliente salía tarificado con dos antigüedades.

/** Carnés que habilitan para moto en el precio. AM (ciclomotor) no cuenta. */
export const CARNETS_MOTO_PRECIO: readonly string[] = ['A', 'A1', 'A2']

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** ¿`aaaa-mm-dd` y existe en el calendario? */
function esFechaIsoValida(s: string | null | undefined): s is string {
  if (typeof s !== 'string') return false
  const m = FECHA_ISO.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/**
 * El carné de moto MÁS ANTIGUO de la ficha (A, A1 o A2) con fecha ISO válida, con su tipo. `null` = ninguno con fecha legible:
 * no se inventa (quien llama decide el siguiente paso). PURA.
 */
export function carnetMotoMasAntiguo(
  carnets: readonly { tipo: string; fechaExpedicion: string | null }[] | null | undefined,
): { tipo: string; fecha: string } | null {
  let mejor: { tipo: string; fecha: string } | null = null
  for (const c of carnets ?? []) {
    const tipo = c.tipo.toUpperCase().replace(/\s/g, '')
    if (!CARNETS_MOTO_PRECIO.includes(tipo) || !esFechaIsoValida(c.fechaExpedicion)) continue
    if (mejor === null || c.fechaExpedicion < mejor.fecha) mejor = { tipo, fecha: c.fechaExpedicion }
  }
  return mejor
}
