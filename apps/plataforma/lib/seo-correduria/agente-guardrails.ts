// lib/seo-correduria/agente-guardrails.ts — lógica pura del agente AUTÓNOMO de SEO de la
// correduría (propone PRs contra apps/asegura-web/lib/ramos.ts, nunca escribe directo a main).
// Mismo patrón que apps/ia-rest/src/lib/seo/guardrails.ts, adaptado: aquí el "target" es un
// SLUG de ramo (@central/module-seguros RAMOS), no una ruta con comodín '/*'.

export const SEO_ASEGURA_MAX_CAMBIOS_DEFAULT = 2
export const SEO_ASEGURA_MIN_IMPR_DEFAULT = 10
export const SEO_ASEGURA_COOLDOWN_DIAS = 7

/** Kill switch. El agente no toca nada salvo que esta env sea EXACTAMENTE 'true'. */
export function agenteHabilitado(env: { SEO_ASEGURA_AGENT_ENABLED?: string }): boolean {
  return env.SEO_ASEGURA_AGENT_ENABLED === 'true'
}

/** Solo se puede tocar un slug de la allowlist (los ramos reales de lib/ramos.ts). */
export function slugEditable(slug: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(slug)
}

export function dentroDeLimite(cambiosEnRun: number, max: number): boolean {
  return cambiosEnRun < max
}

/** ¿Se tocó este slug en los últimos `dias` días? (anti-oscilación, mismo criterio que ia-rest). */
export function enCooldown(
  slug: string,
  recientes: { ruta: string; creadoEn: string | Date }[],
  ahora: Date,
  dias = SEO_ASEGURA_COOLDOWN_DIAS,
): boolean {
  const limite = ahora.getTime() - dias * 86_400_000
  return recientes.some((c) => c.ruta === slug && new Date(c.creadoEn).getTime() >= limite)
}

export function maxCambios(env: { SEO_ASEGURA_MAX_CAMBIOS?: string }): number {
  const n = Number(env.SEO_ASEGURA_MAX_CAMBIOS)
  return Number.isFinite(n) && n > 0 ? n : SEO_ASEGURA_MAX_CAMBIOS_DEFAULT
}

export function minImpresiones(env: { SEO_ASEGURA_MIN_IMPR?: string }): number {
  const n = Number(env.SEO_ASEGURA_MIN_IMPR)
  return Number.isFinite(n) && n > 0 ? n : SEO_ASEGURA_MIN_IMPR_DEFAULT
}
