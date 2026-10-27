// A dónde lleva «Flota» (27/10/2026). PURO: sin BD ni sesión. Lo usan el atajo de «Seguros» (`EnlaceFlota`), el «Abrir» de
// Herramientas y la tarjeta «Mi flota» de Inicio: una sola regla, no tres copias que se separen.
//
// Con UNA sola sociedad y ningún nombramiento por aceptar se salta el índice y se va directo a su flota. Con más, o con un
// nombramiento pendiente (se acepta en el índice), al índice. `null` = no se pudo contar: al índice (lo conservador; saltar
// directo sería afirmar que no hay nada más).

export const RUTA_FLOTA = '/flota' as const

export function destinoFlota(empresas: readonly { id: string }[] | null, pendientes: number | null): string {
  if (empresas !== null && empresas.length === 1 && pendientes === 0) {
    return `${RUTA_FLOTA}?empresa=${encodeURIComponent(empresas[0]!.id)}`
  }
  return RUTA_FLOTA
}
