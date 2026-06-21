// apps/ia-rest/src/lib/seo/guardrails.ts
// Lógica pura del agente SEO. Sin I/O: testeable con tsx.

export const SEO_MAX_CAMBIOS_DEFAULT = 5
export const SEO_MIN_IMPR_DEFAULT = 30
export const SEO_COOLDOWN_DIAS = 7

/** El agente solo corre si SEO_AGENT_ENABLED === 'true' (kill switch). */
export function agenteHabilitado(env: { SEO_AGENT_ENABLED?: string }): boolean {
  return env.SEO_AGENT_ENABLED === 'true'
}

/** Una ruta es editable si matchea un patrón de la allowlist.
 *  Patrón con sufijo '/*' = prefijo (p.ej. '/restaurantes/*'). */
export function rutaEditable(ruta: string, allowlist: string[]): boolean {
  return allowlist.some((pat) => {
    if (pat.endsWith('/*')) return ruta.startsWith(pat.slice(0, -1)) && ruta.length > pat.length - 1
    return ruta === pat
  })
}

/** ¿Quedan cambios por debajo del máximo por pasada? */
export function dentroDeLimite(cambiosEnRun: number, max: number): boolean {
  return cambiosEnRun < max
}

/** ¿La ruta se tocó en los últimos `dias` días? (anti-oscilación) */
export function rutaEnCooldown(
  ruta: string,
  recientes: { ruta: string; created_at: string }[],
  ahora: Date,
  dias = SEO_COOLDOWN_DIAS,
): boolean {
  const limite = ahora.getTime() - dias * 86400000
  return recientes.some((c) => c.ruta === ruta && new Date(c.created_at).getTime() >= limite)
}

/** ¿Las impresiones superan el umbral mínimo para actuar? */
export function superaUmbral(impresiones: number, min: number): boolean {
  return impresiones >= min
}

export function maxCambios(env: { SEO_MAX_CAMBIOS?: string }): number {
  const n = Number(env.SEO_MAX_CAMBIOS)
  return Number.isFinite(n) && n > 0 ? n : SEO_MAX_CAMBIOS_DEFAULT
}

export function minImpresiones(env: { SEO_MIN_IMPR?: string }): number {
  const n = Number(env.SEO_MIN_IMPR)
  return Number.isFinite(n) && n > 0 ? n : SEO_MIN_IMPR_DEFAULT
}
