import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { autorizaSecreto } from "@/lib/cron-auth-decision"

// Autorización para endpoints de cron / escritura del módulo de pricing.
//
// Acepta:
//   - CRON_SECRET (Bearer o ?secret=) → crons de Vercel y llamadas server-to-server.
//   - (opcional) sesión de admin de NextAuth → llamadas desde el panel del propietario.
//
// Sin secreto en producción se deniega: ver `cron-auth-decision.ts`.
export async function isCronAuthorized(
  req: NextRequest,
  opts: { allowSession?: boolean } = {},
): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const produccion = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
  if (!secret) {
    if (produccion) console.error("[cron-auth] CRON_SECRET NO definido en producción — se DENIEGA (revisa las envs)")
    else console.warn("[cron-auth] CRON_SECRET no definido — endpoint sin proteger (solo dev)")
  }
  if (autorizaSecreto({
    secret,
    bearer: req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    qs: req.nextUrl.searchParams.get("secret"),
    produccion,
  })) return true
  if (opts.allowSession) {
    const session = await auth().catch(() => null)
    if (session?.user) return true
  }
  return false
}
