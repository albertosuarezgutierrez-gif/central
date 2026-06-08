export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId)
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID no configurado' }, { status: 500 })

  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ].join(' ')

  // State CSRF: hash simple con secret + fecha (TTL 10min)
  const stateSecret = process.env.CRON_SECRET || process.env.SUPER_ACCESS_KEY || 'iarest'
  const stateTs = Math.floor(Date.now() / 600000) // cambia cada 10 min
  const state = Buffer.from(`${stateSecret}:${stateTs}`).toString('base64url')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  'https://www.iarest.es/api/super/google-oauth-callback',
    response_type: 'code',
    scope:         scopes,
    access_type:   'offline',   // para obtener refresh_token
    prompt:        'consent',   // forzar pantalla consentimiento siempre → garantiza refresh_token
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  return NextResponse.redirect(authUrl)
}
