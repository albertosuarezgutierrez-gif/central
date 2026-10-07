// Timeout contra el proveedor que el caller puede pedir a la pasarela (`body.timeoutMs`).
// Puro (sin `@/`) → testeable con node --test. Tope bajo el `maxDuration` (60 s) de la ruta.
export const TIMEOUT_IA_DEFECTO_MS = 25_000
export const TIMEOUT_IA_MIN_MS = 1_000
export const TIMEOUT_IA_MAX_MS = 55_000

export function acotarTimeoutMs(pedido: unknown): number {
  const n = Number(pedido) || TIMEOUT_IA_DEFECTO_MS
  return Math.min(Math.max(n, TIMEOUT_IA_MIN_MS), TIMEOUT_IA_MAX_MS)
}
