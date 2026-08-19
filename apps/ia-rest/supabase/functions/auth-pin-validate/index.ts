// ia.rest · AUTH-PIN-VALIDATE v9 · con error monitoring
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://ia-rest.vercel.app'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const SESSION_TTL_HOURS: Record<string, number> = {
  super_admin: 4, owner: 24, jefe_sala: 12, camarero: 10, cocina: 10,
}

async function hashIP(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(ip + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getClientIP(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || 'unknown'
  )
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'auth-pin-validate',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · AUTH`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405)

  let restaurante_id: string | undefined
  let pin: string | undefined
  let rol: string | undefined

  try {
    const body = await req.json()
    restaurante_id = body.restaurante_id?.trim()
    pin            = body.pin?.trim()
    rol            = body.rol?.trim() || undefined
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!restaurante_id || !pin) return jsonResponse({ ok: false, error: 'missing_params' }, 400)
  if (!/^\d{4,8}$/.test(pin)) return jsonResponse({ ok: false, error: 'invalid_pin_format' }, 400)

  const salt     = Deno.env.get('IP_HASH_SALT') || 'ia-rest-default-salt-cambiar'
  const clientIP = getClientIP(req)
  const ipHash   = await hashIP(clientIP, salt)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false }, db: { schema: 'iarest' } }
  )

  const { data, error } = await supabase.rpc('validate_pin_with_rate_limit', {
    p_restaurante_id: restaurante_id,
    p_pin:            pin,
    p_ip_hash:        ipHash,
    p_rol:            rol ?? null,
  })

  if (error) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'auth',
      mensaje: `RPC validate_pin_with_rate_limit fallido: ${error.message}`,
      restaurante_id, contexto: { error: error.message },
    })
    console.error('[auth-pin-validate] RPC error:', error.message)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }

  // Múltiples intentos fallidos → warning
  if (!data.ok && data.error === 'locked') {
    await reportarError(supabase, {
      nivel: 'warning', categoria: 'auth',
      mensaje: `IP bloqueada por múltiples intentos fallidos de PIN`,
      restaurante_id, contexto: { ip_hash: ipHash, rol },
    })
  }

  if (!data.ok) {
    const status = data.error === 'locked' ? 429 : 401
    return jsonResponse(data, status)
  }

  const rol_asignado  = data.rol as string
  const ttlHoras      = SESSION_TTL_HOURS[rol_asignado] ?? 8
  const expires_at    = new Date(Date.now() + ttlHoras * 3600 * 1000).toISOString()
  const jwt_jti       = crypto.randomUUID()

  const deviceFingerprint = await hashIP(req.headers.get('user-agent') || 'unknown-agent', salt)

  const { data: sesionExistente } = await supabase
    .from('sesiones_activas')
    .select('device_fingerprint')
    .eq('camarero_id', data.camarero_id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1).maybeSingle()

  const esDispositivoNuevo = sesionExistente
    ? sesionExistente.device_fingerprint !== deviceFingerprint
    : false

  await supabase.from('sesiones_activas').insert({
    camarero_id:        data.camarero_id,
    restaurante_id:     data.restaurante_id,
    device_fingerprint: deviceFingerprint,
    jwt_jti:            jwt_jti,
    rol:                rol_asignado,
    expires_at:         expires_at,
  })

  await supabase.from('security_log').insert({
    restaurante_id: data.restaurante_id,
    evento:         esDispositivoNuevo ? 'new_device_detected' : 'session_created',
    actor_id:       data.camarero_id,
    ip_hash:        ipHash,
    metadata: { jwt_jti, rol: rol_asignado, expires_at, new_device: esDispositivoNuevo },
  })

  return jsonResponse({
    ok: true,
    camarero: {
      id: data.camarero_id, nombre: data.nombre,
      rol: data.rol, restaurante_id: data.restaurante_id,
    },
    sesion: { jti: jwt_jti, expires_at, ttl_horas: ttlHoras },
    aviso: esDispositivoNuevo ? 'new_device_detected' : null,
  })
})
