// lib/sivra/reparto-siquebrilla.ts — desglose del pago mensual a Sique Brilla (puro, testeable).
//
// Contexto (25/08/2026): la factura de Sique Brilla ya NO es solo limpieza — desde julio incluye
// líneas de LAVANDERÍA por peso (la de julio: 4×28€ Luxury + 2×20€ Busto + 2×25€ Dúplex +
// 3×90€ Casa Socorro = 472€ de limpieza, + 172,71€ de lavandería, + IVA = 780,10€). Repartir el
// pago entero como "limpieza por salidas" mezclaba los dos servicios y encima usaba las salidas
// del mes de CAJA (agosto, con 2 salidas aún) en vez de las del mes FACTURADO (julio, 11 salidas):
// a House Sevillana le caían 610,51€ cuando su limpieza real era 270€ + IVA.
//
// Este helper separa el pago en dos partes con la estructura conocida de la factura:
//   limpieza_i  = salidas del mes facturado × tarifa contratada del piso × (1+IVA)
//   lavandería  = el resto del pago (se reparte aguas arriba por capacidad × reservas,
//                 la misma regla acordada para El Giraldillo)
// Sique Brilla factura a mes vencido y se paga a primeros del siguiente, así que el mes
// facturado es el ANTERIOR al del pago (mes de caja del P&L).

export const IVA_LIMPIEZA = 0.21

export interface RepartoSiqueBrilla {
  /** limpieza por piso (con IVA), según salidas del mes facturado × tarifa */
  limpieza: Map<string, number>
  /** resto del pago = lavandería (con IVA); 0 si el pago no llega a cubrir la limpieza */
  lavanderia: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Desglosa el total pagado a Sique Brilla en limpieza por piso + resto de lavandería.
 * `salidasServicio` son las salidas del MES FACTURADO (anterior al de caja), no las del mes del P&L.
 * Devuelve null si no hay salidas con tarifa con las que desglosar (sin datos del mes facturado):
 * el caller decide el fallback — null significa «no se ha podido desglosar», nunca «lavandería 0».
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
    for (const [pid, imp] of esperado) limpieza.set(pid, r2(imp))
    return { limpieza, lavanderia: r2(total - esperadoTotal) }
  }
  // Pago parcial: no cubre ni la limpieza esperada — se reparte lo pagado en proporción
  // y no se afirma lavandería alguna (el resto es hueco, no dato).
  for (const [pid, imp] of esperado) limpieza.set(pid, r2((imp / esperadoTotal) * total))
  return { limpieza, lavanderia: 0 }
}
