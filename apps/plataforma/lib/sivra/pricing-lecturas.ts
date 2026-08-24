// Lecturas auxiliares del motor de precios que pueden caerse SIN invalidar la pasada — pero que
// hasta hoy se caían EN SILENCIO (hallazgo 🟡 4 de `docs/AUDITORIA-2026-08-pricing-mudo.md`).
//
// El `apply` tiene once lecturas que degradan. Tres ya se declaraban (eventos, PriceLabs,
// ocupación-por-mes) y dos abortan la pasada desde el 23/08 (las anclas del raíl, PR #1634).
// Las SEIS de este módulo caían a `[]` con un `.catch(() => [])`: el motor seguía tarificando
// con precios de toda la pinta de estar bien, pero ciego a la señal que perdía — y las dos
// primeras son las señales PRINCIPALES de mercado. Un fallo de red un martes cualquiera dejaba
// los cuatro pisos tarificados con el ancla global sin que nada se pusiera rojo.
//
// La cura NO es abortar (eso es solo para el ancla del raíl, que cambia el TOPE del daño):
// estas seis tienen fallback razonable. La cura es DECLARAR: la pasada sale `ok:false`, el
// latido se pone rojo con el nombre de la lectura, y el Telegram dice qué señal se perdió y
// qué está usando el motor mientras tanto.

export type LecturaCaida = { nombre: string; error: string }

/**
 * Qué pierde el motor cuando cada lectura falla (la columna «efecto si falla» de la auditoría).
 * El aviso lo dice con la lectura, porque «bucket_mes caído» no le dice a nadie dónde duele.
 */
export const EFECTO_LECTURA: Record<string, string> = {
  bucket_mes: 'cae al ancla global: tarifica ciego a lo que pide el mercado ese MES',
  bucket_fecha: 'pierde la estacionalidad por fecha exacta (eventos incluidos); cae al bucket mensual',
  vuelos: 'no sube en fechas de demanda aérea alta',
  antelacion: 'pierde la palanca de antelación (last-minute vs con meses)',
  prior_estacional: 'pierde el suelo/techo histórico (ADR de 6 años)',
  velocidad_reservas: 'pierde la señal de ritmo (≥2 reservas en 7 días = precio corto)',
}

/**
 * Resumen corto para la respuesta HTTP y el parte del latido. `null` si no cayó ninguna.
 * Va nombre a nombre porque el vigía de las 07:45 decide con esto a qué log ir.
 */
export function resumenLecturasCaidas(fallos: LecturaCaida[]): string | null {
  if (fallos.length === 0) return null
  return `lecturas caídas: ${fallos.map(f => f.nombre).join(', ')}`
}

/**
 * Aviso de Telegram cuando alguna lectura auxiliar falla. `null` si ninguna.
 *
 * Deja claro lo que separa esto de un `rail_ciego`: la pasada SÍ tarificó, con fallback —
 * los precios están escritos y son plausibles, que es precisamente por lo que sin este aviso
 * nadie miraría. También dice el error crudo, porque «Serper 400» y «42883» mandan a
 * ficheros opuestos.
 */
export function avisoLecturasCaidas(fallos: LecturaCaida[]): string | null {
  if (fallos.length === 0) return null
  const lineas = fallos.map(f => {
    const efecto = EFECTO_LECTURA[f.nombre] ?? 'señal perdida'
    return `• ${f.nombre}: ${efecto}\n  └ ${f.error}`
  })
  return (
    `🟠 *Pricing: el motor tarificó con ${fallos.length} lectura(s) caída(s)*\n\n` +
    lineas.join('\n') +
    `\n\nLa pasada NO se abortó (estas señales tienen fallback), pero los precios de hoy se ` +
    `calcularon sin ellas y tienen toda la pinta de estar bien — por eso este aviso. Si la ` +
    `caída es de las dos lecturas de mercado (bucket_mes/bucket_fecha), el motor está usando ` +
    `el ancla global: revisa la BD y los logs de \`/api/sivra/pricing/apply\` antes de la ` +
    `siguiente pasada.`
  )
}
