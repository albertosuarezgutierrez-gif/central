import type { NextRequest } from 'next/server'

/**
 * Autorización de los endpoints de cron de `apps/asegura`.
 *
 * 🚨 SIN `CRON_SECRET` NO SE AUTORIZA A NADIE — tampoco en desarrollo. Aquí la
 * regla es más dura que la de `apps/plataforma` (que conserva el paso franco en
 * dev) a propósito: lo que hay detrás de esta puerta manda CORREOS A CLIENTES
 * REALES con el email descifrado de la cartera. Un olvido de env no puede
 * convertirse en «pues en dev pasa»: `undefined` leído como «adelante» es el
 * mismo anti-patrón que el repo persigue en los datos, pero en la cerradura.
 *
 * Consecuencia buscada: si falta la env, los crons fallan RUIDOSAMENTE con 401
 * en vez de funcionar abiertos. Es el estado conservador.
 */
export function autorizaCron(p: { secret?: string | null; bearer?: string | null }): boolean {
  if (!p.secret) return false
  return p.bearer === p.secret
}

export function isCronAuthorized(req: NextRequest | Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[asegura/cron-auth] CRON_SECRET NO definido — se DENIEGA todo (revisa las envs de central-asegura)')
  }
  return autorizaCron({
    secret,
    bearer: req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
  })
}
