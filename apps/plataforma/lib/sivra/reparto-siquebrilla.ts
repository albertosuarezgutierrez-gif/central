// lib/sivra/reparto-siquebrilla.ts — desglose del pago mensual a Si que Brilla (puro, testeable).
//
// Contexto (25/08/2026): la factura de Si que Brilla ya NO es solo limpieza — desde junio incluye
// líneas de LAVANDERÍA por peso (la de julio: 4×28€ Luxury + 2×20€ Busto + 2×25€ Dúplex +
// 3×90€ Casa Socorro = 472€ de limpieza, + 172,71€ de lavandería, + IVA = 780,10€). Repartir el
// pago entero como "limpieza por salidas" mezclaba los dos servicios y encima usaba las salidas
// del mes de CAJA (agosto, con 2 salidas aún) en vez de las del mes FACTURADO (julio, 11 salidas):
// a House Sevillana le caían 610,51€ cuando su limpieza real era 270€ + IVA.
//
// Estos helpers separan cada pago en dos partes con la estructura conocida de la factura:
//   limpieza_i  = salidas del mes facturado × tarifa contratada del piso × (1+IVA)
//   lavandería  = el resto del pago (se reparte aguas arriba por huéspedes reales de las
//                 reservas del mes —fallback a capacidad si el aforo es NULL—, la misma
//                 regla acordada para El Giraldillo; ver lavanderia-peso.ts)
//
// ¿Y cuál es el mes facturado? No siempre el anterior: contra los pagos reales de 2026, Sique
// Brilla cobra unas veces a primeros del mes siguiente (03/04 marzo · 02/06 mayo · 03/08 julio)
// y otras el último día del MISMO mes (30/04 abril · 30/06 junio). Por eso `elegirMesFacturado`
// prueba los candidatos (mes anterior y mes de caja) y se queda con el que mejor AJUSTA al
// importe pagado — las tarifas cuadran al céntimo con las salidas de `incomes` (la factura de
// marzo: 888€ × 1,21 = 1.074,48€ exacto), así que el ajuste distingue los meses sin ambigüedad.

export const IVA_LIMPIEZA = 0.21

export interface RepartoSiqueBrilla {
  /** limpieza por piso (con IVA), según salidas del mes facturado × tarifa */
  limpieza: Map<string, number>
  /** resto del pago = lavandería (con IVA); 0 si el pago no llega a cubrir la limpieza */
  lavanderia: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Limpieza esperada CON IVA para unas salidas × tarifas dadas. */
export function esperadoLimpieza(
  salidas: ReadonlyMap<string, number>,
  tarifas: Record<string, number>,
): number {
  let total = 0
  for (const [pid, n] of salidas) total += Number(n) * (tarifas[pid] ?? 0)
  return r2(total * (1 + IVA_LIMPIEZA))
}

/**
 * Entre varios meses candidatos, el facturado es el que deja el resto (pago − limpieza esperada)
 * más pequeño en valor absoluto. Empate → gana el primero de la lista (el caller ordena por
 * preferencia). Candidatos sin salidas con tarifa no compiten; sin ninguno válido → null.
 */
export function elegirMesFacturado<C extends { salidas: ReadonlyMap<string, number> }>(
  total: number,
  candidatos: C[],
  tarifas: Record<string, number>,
): C | null {
  if (!(total > 0)) return null
  let mejor: C | null = null
  let mejorDiff = Infinity
  for (const c of candidatos) {
    const esperado = esperadoLimpieza(c.salidas, tarifas)
    if (esperado <= 0) continue
    const diff = Math.abs(total - esperado)
    if (diff < mejorDiff) { mejor = c; mejorDiff = diff }
  }
  return mejor
}

/**
 * Desglosa el total pagado a Si que Brilla en limpieza por piso + resto de lavandería.
 * `salidasServicio` son las salidas del MES FACTURADO (ver `elegirMesFacturado`).
 * Devuelve null si no hay salidas con tarifa con las que desglosar: el caller decide el
 * fallback — null significa «no se ha podido desglosar», nunca «lavandería 0».
 */
export function repartirPagoSiqueBrilla(
  total: number,
  salidasServicio: ReadonlyMap<string, number>,
  tarifas: Record<string, number>,
): RepartoSiqueBrilla | null {
  if (!(total > 0)) return null

  const esperado = new Map<string, number>()
  let esperadoTotal = 0
  for (const [pid, salidas] of salidasServicio) {
    const base = Number(salidas) * (tarifas[pid] ?? 0)
    if (base > 0) {
      const conIva = base * (1 + IVA_LIMPIEZA)
      esperado.set(pid, conIva)
      esperadoTotal += conIva
    }
  }
  if (esperadoTotal <= 0) return null

  const limpieza = new Map<string, number>()
  if (total >= esperadoTotal) {
    // Un resto mayor que la propia limpieza no es lavandería creíble (en las facturas reales
    // ronda el 10-40% de la limpieza): probablemente el pago cubre algo que estas salidas no
    // explican (p. ej. dos facturas en una transferencia). Mejor «no sé desglosar» que etiquetar
    // de lavandería un mes entero de limpiezas.
    if (total - esperadoTotal > esperadoTotal) return null
    for (const [pid, imp] of esperado) limpieza.set(pid, r2(imp))
    return { limpieza, lavanderia: r2(total - esperadoTotal) }
  }
  // Pago parcial: no cubre ni la limpieza esperada — se reparte lo pagado en proporción
  // y no se afirma lavandería alguna (el resto es hueco, no dato).
  for (const [pid, imp] of esperado) limpieza.set(pid, r2((imp / esperadoTotal) * total))
  return { limpieza, lavanderia: 0 }
}
