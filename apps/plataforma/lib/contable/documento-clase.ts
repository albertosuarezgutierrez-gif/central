// apps/plataforma/lib/contable/documento-clase.ts
// ¿Qué CLASE de documento me han subido? Módulo PURO (sin BD ni red, testeable con `node --test`).
//
// Motivo (fallo real del 07/08/2026, tres intentos seguidos): Alberto subió al chat el PDF
// «movimientos (1).pdf» —el listado de movimientos de su cuenta corriente— y el agente lo trató
// como una factura suelta, así que contestó «He abierto el documento pero no distingo el importe o
// la fecha con seguridad». Era verdad y a la vez inútil: el documento se lee perfectamente, lo que
// pasa es que NO es una factura. Decir «no lo veo claro» cuando lo que ocurre es «esto es otra
// cosa» manda a Alberto a buscar una copia más nítida de un documento que ya estaba nítido.
//
// El detector NO decide el camino feliz (el lector de factura sigue yendo primero): solo sirve para
// EXPLICAR bien el fallo cuando la extracción de factura no ha sacado importe/fecha. Así una factura
// con varias líneas fechadas (una minuta, una de telefonía) nunca se pierde por un falso positivo.

/** Un listado de movimientos detectado en el texto de un PDF. */
export interface ListadoMovimientos {
  /** Nº de líneas con pinta de movimiento (fecha + importe en formato es-ES). */
  lineas: number
  /** Fecha más antigua vista, 'YYYY-MM-DD'. `null` si ninguna era interpretable. */
  desde: string | null
  /** Fecha más reciente vista, 'YYYY-MM-DD'. */
  hasta: string | null
}

// 'dd/mm/aaaa', 'dd-mm-aaaa' o 'dd/mm/aa' (los extractos de banco español van siempre así).
const RE_FECHA = /\b(\d{2})[/-](\d{2})[/-](\d{2}|\d{4})\b/
// Importe es-ES con 2 decimales: '1.234,56', '-4,17'. Exige la coma decimal para no contar
// números sueltos (nº de cuenta, referencias) como importes.
const RE_IMPORTE = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/

// Nº de líneas de movimiento a partir del cual damos por hecho que es un listado y no una factura.
// Con 5 nos ponemos por encima del detalle de líneas de una factura normal (que además suele traer
// una sola fecha, no una por línea).
const MIN_LINEAS = 5
// …y encima tienen que ser de FECHAS distintas. Una factura detallada (una minuta, una de telefonía)
// puede traer muchas líneas con importe, pero todas del mismo periodo o de un puñado de días; lo que
// caracteriza a un extracto es el goteo de fechas. Sin esta segunda condición, a una factura larga
// que la IA no supo leer se le respondería «esto no es una factura», que es peor que no saber.
const MIN_FECHAS = 3

function iso(dd: string, mm: string, aa: string): string | null {
  const d = Number(dd), m = Number(mm)
  if (d < 1 || d > 31 || m < 1 || m > 12) return null
  const y = aa.length === 2 ? `20${aa}` : aa
  return `${y}-${mm}-${dd}`
}

/**
 * ¿El texto extraído de un PDF es un LISTADO de movimientos (extracto de cuenta, informe de
 * movimientos, histórico) en vez de una factura suelta? Devuelve el recuento y el rango de fechas,
 * o `null` si no lo parece.
 */
export function detectarListadoMovimientos(texto: string | undefined | null): ListadoMovimientos | null {
  if (!texto) return null
  let lineas = 0
  let desde: string | null = null
  let hasta: string | null = null
  const fechas = new Set<string>()

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    if (!linea) continue
    const f = linea.match(RE_FECHA)
    if (!f || !RE_IMPORTE.test(linea)) continue
    lineas++
    const fecha = iso(f[1], f[2], f[3])
    if (!fecha) continue
    fechas.add(fecha)
    if (!desde || fecha < desde) desde = fecha
    if (!hasta || fecha > hasta) hasta = fecha
  }

  return lineas >= MIN_LINEAS && fechas.size >= MIN_FECHAS ? { lineas, desde, hasta } : null
}
