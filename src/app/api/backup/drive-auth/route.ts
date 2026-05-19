import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// GET /api/backup/drive-auth  → redirige a Google OAuth
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!
  const redirectUri = 'https://www.iarest.es/api/backup/drive-auth/callback'

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent') // fuerza refresh_token

  return NextResponse.redirect(url.toString())
}
