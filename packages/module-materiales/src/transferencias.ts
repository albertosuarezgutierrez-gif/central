// Lógica pura de traspasos "en tránsito" entre almacenes.
// Una celda de stock es (disponible, enTransito) para un (material, almacén).
// Regla: mientras las cajas viajan viven en `enTransito` del ORIGEN — no están
// disponibles en ningún almacén hasta que en destino se confirma la recepción.

export interface StockCelda {
  disponible: number
  enTransito: number
}

export type EstadoTraspaso = 'pendiente' | 'recibida' | 'parcial' | 'cancelada'

/** Inicia un traspaso: reserva `cantidad` del origen (disponible → enTransito). */
export function iniciarTraspaso(origen: StockCelda, cantidad: number): StockCelda {
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('cantidad debe ser > 0')
  if (origen.disponible < cantidad) throw new Error('disponible insuficiente en origen')
  return {
    disponible: origen.disponible - cantidad,
    enTransito: origen.enTransito + cantidad,
  }
}

/**
 * Confirma la recepción de un traspaso en destino.
 * `recibidas` entran como disponible en destino; `rotas` se dan de baja.
 * Ambas salen del `enTransito` del origen. Si no se confirma todo lo enviado
 * (recibidas+rotas < enTransito) o hay roturas, el estado es 'parcial'.
 */
export function confirmarRecepcion(
  origen: StockCelda,
  destino: StockCelda,
  recibidas: number,
  rotas: number,
): { origen: StockCelda; destino: StockCelda; rotas: number; estado: 'recibida' | 'parcial' } {
  if (recibidas < 0 || rotas < 0) throw new Error('cantidades no pueden ser negativas')
  const confirmadas = recibidas + rotas
  if (confirmadas <= 0) throw new Error('nada que confirmar')
  if (origen.enTransito < confirmadas) throw new Error('excede lo que hay en tránsito')
  const quedanEnTransito = origen.enTransito - confirmadas
  return {
    origen: { disponible: origen.disponible, enTransito: quedanEnTransito },
    destino: { disponible: destino.disponible + recibidas, enTransito: destino.enTransito },
    rotas,
    estado: rotas > 0 || quedanEnTransito > 0 ? 'parcial' : 'recibida',
  }
}

/** Cancela un traspaso pendiente: devuelve `cantidad` de enTransito a disponible en origen. */
export function cancelarTraspaso(origen: StockCelda, cantidad: number): StockCelda {
  if (origen.enTransito < cantidad) throw new Error('excede lo que hay en tránsito')
  return {
    disponible: origen.disponible + cantidad,
    enTransito: origen.enTransito - cantidad,
  }
}
