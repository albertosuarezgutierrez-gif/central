import type { NextRequest } from 'next/server'

/**
 * Decisión PURA de si una llamada de cron está autorizada. Separada del `NextRequest` para poder
 * testearla, porque el caso importante es justamente el que no se ve en local.
 *
 * 🚨 SIN SECRETO, EN PRODUCCIÓN, SE DENIEGA (08/08/2026). Hasta hoy esta función hacía
 * `if (!secret) return true` con un `console.warn` — es decir, **la ausencia del secreto autorizaba
 * a cualquiera**. Es el mismo anti-patrón que el repo persigue en los datos («un check que se pone
 * verde porque la consulta no devolvió nada»), pero en la puerta: un `undefined` leído como «adelante».
 *
 * Se descubrió porque la rutina de Booking escribía comparables con el campo `ALERTA_TOKEN` **vacío**
 * en sus instrucciones. Si las escrituras entran sin token, el token no es lo que las está abriendo.
 * El radio no era el de esa rutina: `isCronAuthorized` la usan `/api/cron/*` (el dispatcher y todos
 * sus jobs), `/api/internal/{latido,alerta,mapa-arquitectura}` y `/api/sivra/mercado/*`.
 *
 * En DEV se conserva el paso franco (levantar el proyecto en local sin envs sigue funcionando), pero
 * ahí el radio es una máquina, no internet. La regla es la misma que el CLAUDE.md raíz ya exige para
 * los secretos que firman o validan sesiones: **nunca un fallback que valide**.
 */
export function autorizaCron(p: {
  secret?: string | null
  bearer?: string | null
  qs?: string | null
  produccion: boolean
}): boolean {
  if (!p.secret) return !p.produccion
  return p.bearer === p.secret || p.qs === p.secret
}

function enProduccion(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const produccion = enProduccion()
  if (!secret) {
    // Se distingue el nivel de log a propósito: en producción esto no es un aviso, es una avería de
    // configuración que además está tirando peticiones legítimas (los crons) al suelo.
    if (produccion) console.error('[cron-auth] CRON_SECRET NO definido en producción — se DENIEGA todo (revisa las envs del proyecto)')
    else console.warn('[cron-auth] CRON_SECRET no definido — endpoint sin proteger (solo dev)')
  }
  return autorizaCron({
    secret,
    bearer: req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
    qs: new URL(req.url).searchParams.get('secret'),
    produccion,
  })
}

// Token DEDICADO de bajo privilegio para las rutinas de Claude Code (sesiones efímeras que corren
// en un entorno cuyo campo de variables es TEXTO PLANO VISIBLE — no un almacén de secretos). Por eso
// NO se les da el `CRON_SECRET` maestro: llevan este token, cuyo alcance es mínimo (avisar por
// Telegram y empujar el saldo del bróker / disparar la pasada paper — nunca dinero real ni órdenes
// reales). Header-only a propósito (es el token que viaja en prompts): NO se acepta por `?secret=`,
// que se filtraría por logs de acceso / Referer. Sin `ALERTA_TOKEN` definido, este camino no autoriza.
export function isAlertaTokenAuthorized(req: NextRequest): boolean {
  const token = process.env.ALERTA_TOKEN
  if (!token) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === token
}

// Autorización para endpoints pensados para RUTINAS: acepta el token de bajo privilegio
// (`ALERTA_TOKEN`) o, por compatibilidad, el `CRON_SECRET` maestro. Úsala en lugar de
// `isCronAuthorized` en los endpoints que dispara una rutina de Claude Code.
export function isRoutineAuthorized(req: NextRequest): boolean {
  return isAlertaTokenAuthorized(req) || isCronAuthorized(req)
}
