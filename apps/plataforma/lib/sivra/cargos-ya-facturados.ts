// Dedupe del P&L por piso: un pago con factura en `gastos` Y su cargo de tarjeta asignado al piso
// se contaba DOS veces (caso real: televisor de 1.749€ restaba 3.498€).
//
// El enlace explícito es la convención ya existente `movimientos_bancarios.factura_ref =
// 'gasto:<uuid>'` (el conciliador de lib/conciliacion.ts escribe `sivra:gasto:<uuid>`: misma
// semántica, se acepta también). Si el gasto referenciado EXISTE, ya cuenta por el lado `gastos`
// (en su propio mes, que puede ser otro) y el cargo del banco NO debe sumarse otra vez.
// Sin enlace, o con enlace roto (el gasto no existe), el cargo sigue contando: nunca se pierde
// dinero por un emparejamiento supuesto.

export interface CargoPiso {
  propiedad_id: string
  importe: number
  factura_ref: string | null
  /** Calculado en SQL: el gasto que cita `factura_ref` existe en `gastos`. */
  gasto_existe: boolean
}

const RE_REF_GASTO = /^(?:sivra:)?gasto:([0-9a-f-]{36})$/i

/** Id del gasto que cita un `factura_ref`, o null si no es una referencia a gasto. */
export function idGastoDeRef(ref: string | null | undefined): string | null {
  const m = RE_REF_GASTO.exec((ref ?? '').trim())
  return m ? m[1].toLowerCase() : null
}

/** ¿El cargo ya está representado por una factura en `gastos`? */
export function cargoYaFacturado(c: Pick<CargoPiso, 'factura_ref' | 'gasto_existe'>): boolean {
  return idGastoDeRef(c.factura_ref) !== null && c.gasto_existe === true
}

/** Importe (positivo) de los cargos NO representados por un gasto, sumado por piso. */
export function sumarCargosSinFactura(cargos: CargoPiso[]): Map<string, number> {
  const porPiso = new Map<string, number>()
  for (const c of cargos) {
    if (cargoYaFacturado(c)) continue
    porPiso.set(c.propiedad_id, (porPiso.get(c.propiedad_id) ?? 0) + Math.abs(Number(c.importe)))
  }
  return porPiso
}
