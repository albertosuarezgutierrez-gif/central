import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"

// Autorización para endpoints de cron / escritura del módulo de pricing.
//
// Acepta:
//   - CRON_SECRET (Bearer o ?secret=) → crons de Vercel y llamadas server-to-server.
//   - (opcional) sesión de admin de NextAuth → llamadas desde el panel del propietario.
//
// Transición: si CRON_SECRET aún NO está definido en el entorno, permite el acceso (para no
// romper los crons existentes antes de definir la env en Vercel) y deja un aviso en el log.
// En cuanto se define CRON_SECRET en producción, estos endpoints quedan protegidos.
export async function isCronAuthorized(
  req: NextRequest,
  opts: { allowSession?: boolean } = {},
): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    const qs = req.nextUrl.searchParams.get("secret")
    if (bearer === secret || qs === secret) return true
  } else {
    console.warn("[cron-auth] CRON_SECRET no definido — endpoint sin proteger (definir en Vercel)")
    return true
  }
  if (opts.allowSession) {
    const session = await auth().catch(() => null)
    if (session?.user) return true
  }
  return false
}
