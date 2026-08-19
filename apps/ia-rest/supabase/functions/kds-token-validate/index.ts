// ia.rest · Edge Function: kds-token-validate
// Versión: 1.0
// Valida el token del KDS de cocina.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://ia-rest.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'method_not_allowed' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  let restaurante_id: string, token: string

  try {
    const body = await req.json()
    restaurante_id = body.restaurante_id?.trim()
    token          = body.token?.trim()
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_json' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  if (!restaurante_id || !token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_params' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    console.warn('[kds-token-validate] invalid token format for restaurante:', restaurante_id)
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_token_format' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false }, db: { schema: 'iarest' } }
  )

  const { data: restaurante, error } = await supabase
    .from('restaurantes')
    .select('id, nombre, kds_token')
    .eq('id', restaurante_id)
    .single()

  if (error || !restaurante) {
    return new Response(
      JSON.stringify({ ok: false, error: 'restaurante_not_found' }),
      { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  if (restaurante.kds_token !== token) {
    const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const ipHash = await hashString(ipRaw)

    await supabase.from('security_log').insert({
      restaurante_id,
      evento:   'kds_access_invalid',
      ip_hash:  ipHash,
      metadata: { token_preview: token.slice(0, 8) + '...' },
    })

    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_token' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ ok: true, restaurante_id: restaurante.id, nombre: restaurante.nombre }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})

async function hashString(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
