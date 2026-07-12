import type { NextRequest } from 'next/server'

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[cron-auth] CRON_SECRET no definido — endpoint sin proteger')
    // En producción, sin secreto NO se autoriza (fail-secure); en dev se permite.
    return process.env.NODE_ENV !== 'production'
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  return bearer === secret || qs === secret
}
