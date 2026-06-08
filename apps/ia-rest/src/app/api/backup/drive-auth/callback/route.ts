import { NextRequest, NextResponse } from 'next/server'

// GET /api/backup/drive-auth/callback  → intercambia code por tokens y guarda refresh_token
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>❌ Error OAuth</h2><p>${error ?? 'Sin código'}</p>
        <a href="/super">← Volver</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = 'https://www.iarest.es/api/backup/drive-auth/callback'

  // Intercambiar code por tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>⚠️ Sin refresh_token</h2>
        <p>Google no devolvió refresh_token. Respuesta: <pre>${JSON.stringify(tokens, null, 2)}</pre></p>
        <a href="/super">← Volver</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Guardar refresh_token en Vercel via API
  const vercelToken = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID

  if (vercelToken && projectId && teamId) {
    await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'GOOGLE_DRIVE_REFRESH_TOKEN',
        value: tokens.refresh_token,
        type: 'encrypted',
        target: ['production', 'preview'],
      }),
    })
  }

  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto">
      <h2>✅ Google Drive autorizado</h2>
      <p>El backup automático está configurado correctamente.</p>
      <p><strong>Refresh token guardado.</strong> El cron nocturno ya puede subir copias a tu Drive.</p>
      <p style="margin-top:1.5rem">
        <strong>Refresh token (guárdalo como env var GOOGLE_DRIVE_REFRESH_TOKEN si no se guardó automáticamente):</strong><br>
        <code style="word-break:break-all;background:#f4f4f4;padding:0.5rem;display:block;margin-top:0.5rem">${tokens.refresh_token}</code>
      </p>
      <a href="/super" style="display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;background:#2B6A9E;color:white;border-radius:6px;text-decoration:none">← Volver a /super</a>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
