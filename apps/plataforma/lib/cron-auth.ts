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

// Auth para /api/internal/alerta — la ÚNICA puerta que usan las rutinas efímeras de
// Claude Code (solo sirve para mandar un Telegram). A diferencia de isCronAuthorized:
//   1. Acepta un token DEDICADO de bajo privilegio `ALERTA_SECRET` (si una rutina lo
//      filtra, el peor caso es "alguien manda un Telegram", NO tocar crons/banca).
//   2. Sigue aceptando el `CRON_SECRET` grande por RETROCOMPATIBILIDAD durante la
//      migración (una vez ALERTA_SECRET esté puesto en todas las rutinas se puede quitar).
//   3. Header-only (Bearer): NO acepta `?secret=` en la URL (evita filtrar el token por
//      logs/Referer). Las rutinas ya mandan el token por cabecera Authorization.
//   4. Falla CERRADO si no hay ningún secreto configurado (no manda Telegram a anónimos).
export function isAlertaAuthorized(req: NextRequest): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return false
  const alerta = process.env.ALERTA_SECRET
  const cron = process.env.CRON_SECRET
  if (!alerta && !cron) {
    console.warn('[alerta-auth] ni ALERTA_SECRET ni CRON_SECRET definidos — se rechaza')
    return false
  }
  return (!!alerta && bearer === alerta) || (!!cron && bearer === cron)
}
