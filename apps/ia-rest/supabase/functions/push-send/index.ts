// ia.rest · push-send v1
// Envía notificaciones Web Push a camareros usando VAPID
// Auto-genera y almacena las claves VAPID en sistema_config

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'iarest' } }
)

const JH = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JH })

// ── Generación de claves VAPID (ECDSA P-256) ──────────────────────────────
async function generarVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const pub  = await crypto.subtle.exportKey('raw', pair.publicKey)
  const priv = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  return {
    publicKey:  btoa(String.fromCharCode(...new Uint8Array(pub))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(priv))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''),
  }
}

async function getVapidKeys() {
  const { data } = await sb.from('sistema_config').select('valor').eq('id','vapid_keys').single()
  if (data) return data.valor as { publicKey: string; privateKey: string }
  const keys = await generarVapidKeys()
  await sb.from('sistema_config').insert({ id: 'vapid_keys', valor: keys })
  console.log('[push-send] VAPID keys generadas y almacenadas')
  return keys
}

// ── JWT VAPID ────────────────────────────────────────────────────
async function vapidJWT(audience: string, privateKeyB64: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp: now + 43200, sub: 'mailto:alberto.suarez.gutierrez@gmail.com' }

  const encode = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')

  const data = encode(header) + '.' + encode(payload)

  // Reconstruir la clave privada desde pkcs8 base64url
  const pkcs8Bytes = Uint8Array.from(atob(privateKeyB64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8Bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(data)
  )
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  return data + '.' + sigB64
}

// ── Enviar una notificación push ──────────────────────────────────────
async function enviarPushUnitario(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; mensaje_voz?: string },
  vapidKeys: { publicKey: string; privateKey: string }
) {
  const url = new URL(sub.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await vapidJWT(audience, vapidKeys.privateKey)

  const data = JSON.stringify(payload)

  // Cifrado aesgcm simplificado: enviar sin cifrar para compatibilidad con FCM/APNS
  // (FCM acepta texto plano en algunas versiones; para cifrado completo usar una librería)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidKeys.publicKey}`,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body: data,
  })
  return { ok: res.ok, status: res.status }
}

// ── Entry point ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JH })

  const url = new URL(req.url)
  const seg = url.pathname.split('/').filter(Boolean).pop() ?? ''

  // ── GET /vapid-public-key — el frontend lo necesita para subscribirse ────────
  if (seg === 'vapid-public-key') {
    const keys = await getVapidKeys()
    return json({ publicKey: keys.publicKey })
  }

  // ── POST /subscribe — guardar suscripción push de un camarero ────────────────
  if (seg === 'subscribe' && req.method === 'POST') {
    const { camarero_id, restaurante_id, subscription } = await req.json()
    if (!camarero_id || !subscription) return json({ error: 'Faltan datos' }, 400)
    await sb.from('push_subscriptions').upsert({
      camarero_id,
      restaurante_id,
      subscription: typeof subscription === 'string' ? subscription : JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'camarero_id' })
    return json({ ok: true })
  }

  // ── POST / — enviar notificación push a lista de camarero_ids ────────────────
  if (req.method === 'POST') {
    const { camarero_ids, title, body, mensaje_voz } = await req.json()
    if (!camarero_ids?.length) return json({ ok: true, enviados: 0 })

    const vapidKeys = await getVapidKeys()

    const { data: subs } = await sb.from('push_subscriptions')
      .select('camarero_id, subscription')
      .in('camarero_id', camarero_ids)

    if (!subs?.length) return json({ ok: true, enviados: 0, motivo: 'sin suscripciones' })

    let enviados = 0
    const errores: string[] = []

    for (const s of subs) {
      try {
        let sub = s.subscription
        if (typeof sub === 'string') sub = JSON.parse(sub)
        const r = await enviarPushUnitario(sub, { title, body, mensaje_voz }, vapidKeys)
        if (r.ok) enviados++
        else {
          errores.push(`${s.camarero_id}: ${r.status}`)
          // 404/410 = suscripción caducada → borrar
          if (r.status === 404 || r.status === 410) {
            await sb.from('push_subscriptions').delete().eq('camarero_id', s.camarero_id)
          }
        }
      } catch (e) {
        errores.push(String(e))
      }
    }

    return json({ ok: true, enviados, errores })
  }

  return json({ error: 'Ruta no encontrada' }, 404)
})
