// Filas del libro con `liq_origen='pdf'` que ya no respalda ningún PDF de la pasada. PURO.
// Si CIMA trae el periodo con otras fechas, o gana otro PDF solapado, la fila vieja conserva su
// liquidación y se sumaría doble. El cron la limpia por `liq_hash` (`pdf:<nº documento>`).
// Las filas `manual` o `cima` no se tocan: el cron filtra por `liq_origen = 'pdf'`.

/** Hashes (`pdf:<nº>`) de los documentos que SÍ sostienen una fila en esta pasada. */
export function hashesPdfVigentes(usados: readonly string[]): string[] {
  return usados.map(n => `pdf:${n}`)
}

/** ¿Esta fila (origen + hash) es un PDF huérfano? Espejo en TS del WHERE del cron. */
export function esPdfHuerfano(fila: { liqOrigen: string | null; liqHash: string | null }, vigentes: readonly string[]): boolean {
  return fila.liqOrigen === 'pdf' && !vigentes.includes(fila.liqHash ?? '')
}
