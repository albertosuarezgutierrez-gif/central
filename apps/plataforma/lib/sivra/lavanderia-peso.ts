// Peso de un piso en el reparto de lavandería (Giraldillo + la incluida en el pago a Sique
// Brilla). Regla acordada con Alberto (29/08/2026): «nº de reservas y huéspedes» — cada reserva
// del mes aporta sus HUÉSPEDES REALES (incomes.adults+children); si una reserva aún no tiene el
// aforo informado (NULL = «no se sabe», nunca 0), esa reserva cae a la CAPACIDAD del piso, que
// era la regla anterior (capacidad × reservas). Así la fórmula mejora sola según el sync rellena
// el aforo, sin inventar ceros.
export function pesoLavanderia(
  huespedesReales: number | null,   // Σ (adults+children) de las reservas del mes CON aforo; null = ninguna lo tiene
  reservasSinAforo: number,         // nº de reservas del mes con adults Y children a NULL
  maxGuests: number | null,         // capacidad del piso (fallback); null = desconocida
): number {
  return (huespedesReales ?? 0) + reservasSinAforo * (maxGuests ?? 0)
}
