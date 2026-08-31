// lib/sivra/canales-logica.ts — qué se puede AFIRMAR de la comisión de un canal (puro, testeado).
//
// Caso fundacional (31/08/2026, revisión de datos de /sivra/resultado-pisos): Expedia, Airbnb y
// Agoda salían con «comisión 0,00€» — pero ese 0 no es un dato medido: en `portal_rates` su tarifa
// está a 0 con descripción «Pendiente confirmar con factura real», así que el trigger deja
// neto = bruto y el 0 es un «no lo sé» disfrazado de valor (tercer hermano de la regla del
// CLAUDE.md raíz). Solo Booking tiene tarifa verificada con factura (19,72%). Pintar «sin
// comisión» en Expedia afirmaría que ese canal sale gratis — y encima su ingreso mostrado va
// SIN descontar la comisión real, o sea, algo inflado. Eso hay que decirlo, no taparlo con un 0.

export type EstadoComision =
  /** Comisión medida de verdad (Σ bruto − neto > 0). */
  | { tipo: 'medida'; importe: number }
  /** Reservas sin `amount_gross`: su comisión no está en ninguna cifra. */
  | { tipo: 'sin_bruto'; reservas: number }
  /** Canal directo: sin intermediario, comisión 0 por naturaleza (afirmable). */
  | { tipo: 'sin_comision' }
  /** La tarifa del portal está a 0 «pendiente de confirmar»: la comisión real NO está
   *  descontada del ingreso y no se sabe cuánta es. NUNCA pintarlo como 0€. */
  | { tipo: 'tarifa_pendiente' }

/** Canales cuyo 0 de comisión es estructural, no un centinela: no hay intermediario. */
const SIN_INTERMEDIARIO = new Set(['DIRECTO'])

export function estadoComision(args: {
  portal: string
  comision: number
  sinBruto: number
  /** commission_pct de `portal_rates` para el portal; null = el portal no está en la tabla. */
  tarifaPct: number | null
}): EstadoComision {
  const { portal, comision, sinBruto, tarifaPct } = args
  if (comision > 0) return { tipo: 'medida', importe: comision }
  if (sinBruto > 0) return { tipo: 'sin_bruto', reservas: sinBruto }
  if (SIN_INTERMEDIARIO.has(portal)) return { tipo: 'sin_comision' }
  // Tarifa a 0 (o portal sin fila): el 0 resultante es un centinela, no una medición.
  if (tarifaPct == null || tarifaPct <= 0) return { tipo: 'tarifa_pendiente' }
  // Tarifa configurada > 0 pero comisión 0: sin reservas con bruto que descontar.
  return { tipo: 'sin_comision' }
}

/** ¿Hay algún canal del listado cuyo ingreso mostrado NO lleva la comisión descontada? */
export function hayTarifasPendientes(
  canales: Array<{ portal: string; comision: number; sinBruto: number; tarifaPct: number | null }>,
): string[] {
  return canales
    .filter(c => estadoComision(c).tipo === 'tarifa_pendiente')
    .map(c => c.portal)
}
