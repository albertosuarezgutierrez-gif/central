// Lógica pura del ciclo de eventos/alquileres sobre una celda de stock por almacén.
// Estados de una unidad: disponible → reservado (comprometido a un evento) →
// fuera (entregado, en manos del cliente) → de vuelta a disponible al devolver.
// Las roturas se pierden (no vuelven). La cantidad "en propiedad" (owned) se
// conserva salvo roturas: owned = disponible + reservado + enTransito + fuera.

export interface CeldaEvento {
  disponible: number
  reservado: number
  enTransito: number
  fuera: number
}

const req = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg)
}

/** Reserva `cantidad` para un evento: disponible → reservado. */
export function reservar(c: CeldaEvento, cantidad: number): CeldaEvento {
  req(cantidad > 0, 'cantidad debe ser > 0')
  req(c.disponible >= cantidad, 'disponible insuficiente para reservar')
  return { ...c, disponible: c.disponible - cantidad, reservado: c.reservado + cantidad }
}

/** Cancela una reserva no entregada: reservado → disponible. */
export function cancelarReserva(c: CeldaEvento, cantidad: number): CeldaEvento {
  req(c.reservado >= cantidad, 'no hay tanto reservado')
  return { ...c, reservado: c.reservado - cantidad, disponible: c.disponible + cantidad }
}

/** Entrega `cantidad` reservada al cliente: reservado → fuera. */
export function entregar(c: CeldaEvento, cantidad: number): CeldaEvento {
  req(cantidad > 0, 'cantidad debe ser > 0')
  req(c.reservado >= cantidad, 'no hay tanto reservado para entregar')
  return { ...c, reservado: c.reservado - cantidad, fuera: c.fuera + cantidad }
}

/**
 * Devuelve material entregado. `buenas` vuelven a disponible; `rotas` se pierden.
 * Ambas salen de `fuera`. Devuelve la celda resultante y las rotas registradas.
 */
export function devolver(
  c: CeldaEvento,
  buenas: number,
  rotas: number,
): { celda: CeldaEvento; rotas: number } {
  req(buenas >= 0 && rotas >= 0, 'cantidades no pueden ser negativas')
  const total = buenas + rotas
  req(total > 0, 'nada que devolver')
  req(c.fuera >= total, 'excede lo que hay fuera')
  return {
    celda: { ...c, fuera: c.fuera - total, disponible: c.disponible + buenas },
    rotas,
  }
}

/** Cantidad en propiedad (independiente de dónde esté): la que sobrevive salvo roturas. */
export function enPropiedad(c: CeldaEvento): number {
  return c.disponible + c.reservado + c.enTransito + c.fuera
}

/** ¿Dos rangos de fechas [aI,aF] y [bI,bF] (YYYY-MM-DD) se solapan? */
export function solapa(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return aIni <= bFin && bIni <= aFin
}
