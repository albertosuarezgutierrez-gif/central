// lib/sivra/facturas-mensuales.ts — vigilante de proveedores de factura MENSUAL (puro, testeable).
//
// Contexto (28/07/2026): la factura de mayo de Lavandería El Giraldillo (AFV-11625) se quedó
// SIN PAGAR — el proveedor la reclamó el 25/05, la reenvió el 30/06 y Alberto acabó pagando dos
// facturas el mismo día (05/07). Nadie avisó porque ningún check vigilaba "todos los meses debe
// llegar (y pagarse) una factura de X". Este helper decide, sin BD ni red, si a un proveedor
// mensual le falta el mes anterior; el health-check (Check 11) le da los datos y avisa.

export interface ProveedorMensualEstado {
  nombre: string
  /** fecha (YYYY-MM-DD) de la última factura registrada en `gastos`, o null */
  ultimaFactura: string | null
  /** fecha (YYYY-MM-DD) del último pago visto en el banco, o null */
  ultimoPago: string | null
}

/** Primer día del mes anterior a `hoy`, en YYYY-MM-DD. */
function inicioMesAnterior(hoy: string): string {
  const [y, m] = hoy.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1))
  return prev.toISOString().slice(0, 10)
}

/**
 * Proveedores mensuales con el MES ANTERIOR en descubierto: ni factura en `gastos` ni pago en el
 * banco con fecha >= inicio del mes anterior. Solo evalúa a partir del día `diaGracia` del mes
 * (default 5) — antes de eso la factura del mes previo puede simplemente no haber llegado aún.
 */
export function facturasMensualesFaltantes(
  hoy: string,
  proveedores: ProveedorMensualEstado[],
  diaGracia = 5,
): string[] {
  const dia = Number(hoy.slice(8, 10))
  if (dia < diaGracia) return []
  const corte = inicioMesAnterior(hoy)
  const faltan: string[] = []
  for (const p of proveedores) {
    const facturaOk = !!p.ultimaFactura && p.ultimaFactura >= corte
    const pagoOk = !!p.ultimoPago && p.ultimoPago >= corte
    if (!facturaOk && !pagoOk) faltan.push(p.nombre)
  }
  return faltan
}
