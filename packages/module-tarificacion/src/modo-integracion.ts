// Cómo se habla con cada compañía/ramo (05/10/2026). Fila de `seguros.companias_integracion`.
//
// 🚨 FAIL-CLOSED: solo `rpa_autorizada` automatiza. Cualquier otro valor —incluido uno que no se
// conoce, `null`, un texto con mayúsculas o espacios— NO automatiza. `rpa_no_confirmada` existe
// justo para decir «hay bot posible pero nadie ha firmado que se pueda usar».

export const MODOS_INTEGRACION = [
  'api_oficial',
  'integracion_oficial',
  'rpa_autorizada',
  'rpa_no_confirmada',
  'rpa_prohibida',
  'manual',
] as const

export type ModoIntegracion = (typeof MODOS_INTEGRACION)[number]

export function esModoIntegracion(v: unknown): v is ModoIntegracion {
  return typeof v === 'string' && (MODOS_INTEGRACION as readonly string[]).includes(v)
}

/** ¿Puede el bot entrar en el portal? Solo con `rpa_autorizada` EXACTO. */
export function puedeAutomatizar(modo: unknown): boolean {
  return modo === 'rpa_autorizada'
}
