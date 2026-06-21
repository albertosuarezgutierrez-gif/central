export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const VERCEL_TOKEN  = process.env.VERCEL_TOKEN_INTERNAL || ''
const PROJECT_ID    = 'prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo'
const TEAM_ID       = 'team_f4gPpt6dPuNcd5YyMt3q27uf'

async function upsertVercelEnv(key: string, value: string) {
  // Intentar crear primero
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview'] }),
    }
  )
  const data = await res.json()

  // Si ya existe (conflict), actualizar por ID
  if (data.error?.code === 'ENV_ALREADY_EXISTS' && data.error?.envVarId) {
    await fetch(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${data.error.envVarId}?teamId=${TEAM_ID}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }
    )
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  // Validar state CSRF (misma lógica que google-oauth/route.ts)
  const stateSecret = process.env.CRON_SECRET || process.env.SUPER_ACCESS_KEY || 'iarest'
  const stateTs = Math.floor(Date.now() / 600000)
  const validStates = [
    Buffer.from(`${stateSecret}:${stateTs}`).toString('base64url'),
    Buffer.from(`${stateSecret}:${stateTs - 1}`).toString('base64url'), // tolerancia 1 ventana
  ]
  if (!state || !validStates.includes(state)) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7">
        <h2 style="color:#D9442B">❌ State inválido o caducado</h2>
        <p>Inicia el flujo desde /super.</p>
        <a href="/super" style="color:#E8A33B">← Volver a /super</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (error) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7">
        <h2 style="color:#D9442B">❌ Error de autorización</h2>
        <p>${error}</p>
        <a href="/super" style="color:#E8A33B">← Volver a /super</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (!code) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7">
        <h2 style="color:#D9442B">❌ No se recibió código de autorización</h2>
        <a href="/super" style="color:#E8A33B">← Volver a /super</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  try {
    // Intercambiar code por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri:  'https://www.iarest.es/api/super/google-oauth-callback',
        grant_type:    'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (!tokens.refresh_token) {
      return new NextResponse(
        `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7">
          <h2 style="color:#D9442B">❌ No se obtuvo refresh_token</h2>
          <p>Respuesta: ${JSON.stringify(tokens)}</p>
          <p>Intenta revocar el acceso en <a href="https://myaccount.google.com/permissions" style="color:#E8A33B">myaccount.google.com/permissions</a> y vuelve a autorizar.</p>
          <a href="/super" style="color:#E8A33B">← Volver a /super</a>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Guardar refresh_token en Vercel automáticamente
    if (VERCEL_TOKEN) {
      await upsertVercelEnv('GOOGLE_DRIVE_REFRESH_TOKEN', tokens.refresh_token)
    }

    // Obtener info del usuario para confirmar
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const user = await userRes.json()

    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7;max-width:600px;margin:0 auto">
        <h2 style="color:#3F7D44">✅ Google Analytics y Search Console conectados</h2>
        <p style="color:#D8CDB6">Cuenta autorizada: <strong style="color:#F6F1E7">${user.email || 'desconocida'}</strong></p>
        <div style="background:#1E1914;border:1px solid #3A3228;border-radius:8px;padding:16px;margin:16px 0">
          <div style="color:#E8A33B;margin-bottom:8px;font-size:12px">SCOPES AUTORIZADOS</div>
          <div style="color:#D8CDB6;font-size:12px">✓ Google Analytics (lectura)</div>
          <div style="color:#D8CDB6;font-size:12px">✓ Google Search Console (lectura)</div>
        </div>
        <div style="background:#1E1914;border:1px solid #3F7D44;border-radius:8px;padding:16px;margin:16px 0">
          <div style="color:#3F7D44;margin-bottom:8px;font-size:12px">REFRESH TOKEN GUARDADO</div>
          <div style="color:#D8CDB6;font-size:12px">${VERCEL_TOKEN ? '✓ Guardado automáticamente en Vercel env vars' : '⚠️ Copia este token manualmente en Vercel: ' + tokens.refresh_token}</div>
        </div>
        <p style="color:#9A8D7C;font-size:12px">El agente SEO ya puede acceder a tus datos reales. Vuelve a /super y pruébalo.</p>
        <a href="/super" style="display:inline-block;background:#D9442B;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:8px">← Volver a /super</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )

  } catch (err: any) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#14110E;color:#F6F1E7">
        <h2 style="color:#D9442B">❌ Error</h2>
        <p>${err.message}</p>
        <a href="/super" style="color:#E8A33B">← Volver a /super</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }
}
