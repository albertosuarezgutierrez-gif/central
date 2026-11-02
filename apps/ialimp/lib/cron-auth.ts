// Autorización de crons de ialimp (02/11/2026). Mismo criterio que plataforma/lib/cron-auth.ts:
//   · Solo `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo envía solo si CRON_SECRET existe
//     en el proyecto; en ialimp existe en Production).
//   · Sin CRON_SECRET en producción ⇒ se DENIEGA (nunca «Bearer undefined» ni un `if (secret && …)`).
//   · Comparación en tiempo constante.
// Sin imports de Next para poder testearlo con `node --test` (lib/cron-auth.test.ts).
import { timingSafeEqual } from 'node:crypto'

export function igualSeguro(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export function enProduccion(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

export function autorizaCron(p: { secret?: string | null; bearer?: string | null; produccion: boolean }): boolean {
  if (!p.secret) return !p.produccion
  return igualSeguro(p.bearer, p.secret)
}

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  const produccion = enProduccion()
  if (!secret && produccion) console.error('[cron-auth] CRON_SECRET NO definido en producción — se DENIEGA')
  return autorizaCron({
    secret,
    bearer: req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null,
    produccion,
  })
}
