// Decisión PURA de cron-auth (sin imports de Next/NextAuth, para poder testearla con node --test).
//
// 🚨 SIN SECRETO, EN PRODUCCIÓN, SE DENIEGA (23/09/2026). Hasta hoy la ausencia de CRON_SECRET
// autorizaba a cualquiera («transición»). Es el mismo fallo que plataforma corrigió el 08/08/2026 en
// su `lib/cron-auth.ts`; esta copia se quedó sin portar. En dev se conserva el paso franco.
export function autorizaSecreto(p: {
  secret?: string | null
  bearer?: string | null
  qs?: string | null
  produccion: boolean
}): boolean {
  if (!p.secret) return !p.produccion
  return p.bearer === p.secret || p.qs === p.secret
}
