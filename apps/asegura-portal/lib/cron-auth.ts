import type { NextRequest } from 'next/server'

/**
 * Autorización del cron de avisos por push. Mismo patrón que `apps/asegura/lib/cron-auth.ts`:
 * sin `CRON_SECRET` no se autoriza a NADIE, tampoco en desarrollo. Detrás de esta puerta se manda
 * una notificación a dispositivos reales; un olvido de env tiene que fallar con 401 ruidoso, no
 * funcionar abierto.
 */
export function isCronAuthorized(req: NextRequest | Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[asegura-portal/cron-auth] CRON_SECRET NO definido — se DENIEGA todo')
    return false
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === secret
}
