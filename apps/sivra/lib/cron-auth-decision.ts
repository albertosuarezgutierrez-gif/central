// Decisión PURA de cron-auth (sin imports de Next/NextAuth, para poder testearla con node --test).
//
// 🚨 SIN SECRETO, EN PRODUCCIÓN, SE DENIEGA (23/09/2026). Hasta hoy la ausencia de CRON_SECRET
// autorizaba a cualquiera («transición»). Es el mismo fallo que plataforma corrigió el 08/08/2026 en
// su `lib/cron-auth.ts`; esta copia se quedó sin portar. En dev se conserva el paso franco.
//
// Comparación en TIEMPO CONSTANTE (02/11/2026): `===` filtra por tiempo cuántos caracteres casan.
import { timingSafeEqual } from "node:crypto"

export function igualSeguro(a: string | null | undefined, b: string): boolean {
  if (typeof a !== "string" || !b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export function autorizaSecreto(p: {
  secret?: string | null
  bearer?: string | null
  qs?: string | null
  produccion: boolean
}): boolean {
  if (!p.secret) return !p.produccion
  return igualSeguro(p.bearer, p.secret) || igualSeguro(p.qs, p.secret)
}

// Cabecera `Authorization` de un cron ESTRICTA: sin CRON_SECRET nunca casa (ni en dev). Sustituye a la comparación a pelo con
// la plantilla «Bearer + process.env.CRON_SECRET», que con la variable ausente aceptaba «Bearer undefined».
export function bearerCronValido(authorization: string | null | undefined, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || typeof authorization !== "string") return false
  return igualSeguro(authorization.replace(/^Bearer\s+/i, ""), secret)
}
