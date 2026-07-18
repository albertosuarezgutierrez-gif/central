import type { NextRequest } from 'next/server'

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[cron-auth] CRON_SECRET no definido — endpoint sin proteger')
    return true
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  return bearer === secret || qs === secret
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
