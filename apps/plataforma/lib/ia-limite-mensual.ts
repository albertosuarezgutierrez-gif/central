// Límite MENSUAL de la pasarela de IA (nº de llamadas OK/mes) — resolución del valor efectivo.
//
// Por qué existe (25/08/2026): la env `AI_GATEWAY_LIMITE_MENSUAL` se agotó el 24/08 y los
// /api/ai/* pasaron a 429 hasta el día 1. Alberto pidió subirla, pero las sesiones de Claude no
// pueden escribir envs de Vercel (el conector no lo permite), así que el mando vive ahora en la
// fila única de la tabla `ia_limite_mensual` (mismo patrón que `empresas_acceso_token` /
// `trading_acceso_token`: editable por Supabase MCP sin redeploy). La BD MANDA cuando tiene
// valor; sin fila (o BD caída), manda la env. Módulo PURO: la lectura de BD vive en ai-gateway.ts.

/**
 * Valor efectivo del límite mensual: `db` (la fila de `ia_limite_mensual`) manda si es un número
 * válido; si no, la env. 0 = sin límite. Un valor negativo o ilegible se trata como 0 (sin límite)
 * y no como «bloquear todo»: un mando corrupto no puede apagar la pasarela entera.
 */
export function limiteMensualEfectivo(db: number | null | undefined, env: string | undefined): number {
  if (typeof db === 'number' && Number.isFinite(db)) return db < 0 ? 0 : db
  const n = Number(env ?? 0)
  return !Number.isFinite(n) || n < 0 ? 0 : n
}
