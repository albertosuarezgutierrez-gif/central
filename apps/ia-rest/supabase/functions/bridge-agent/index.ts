// ia.rest · Bridge Agent API v1
// API server-side para el agente local Node.js
// El agente se autentica con su bridge_token (brt_...)
// No requiere JWT de Supabase — auth propia por token

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'iarest' } }
)

const JH = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bridge-Token',
}

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: JH })

// Autenticar agente por token en header X-Bridge-Token o Authorization: Bearer
async function getAgent(req: Request) {
  const raw =
    req.headers.get('x-bridge-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '') ??
    ''
  if (!raw) return null
  const { data } = await sb
    .from('bridge_tokens')
    .select('id, restaurante_id, activo')
    .eq('token', raw)
    .single()
  if (!data || !data.activo) return null
  return data as { id: string; restaurante_id: string; activo: boolean }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const seg = parts[parts.length - 1] ?? ''
  const seg2 = parts[parts.length - 2] ?? ''

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JH })

  // ── POST /heartbeat ───────────────────────────────────────────────
  // Agente reporta que está vivo + info de la máquina
  // Devuelve lista de devices asignados a este agente
  if (seg === 'heartbeat' && req.method === 'POST') {
    const agent = await getAgent(req)
    if (!agent) return json({ error: 'Token inválido o inactivo' }, 401)

    const body = await req.json().catch(() => ({}))
    const { version, plataforma, hostname, ip_lan } = body

    // Actualizar metadatos del agente
    await sb.from('bridge_tokens').update({
      ultimo_ping: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(version    && { version }),
      ...(plataforma && { plataforma }),
      ...(hostname   && { hostname }),
      ...(ip_lan     && { ip_lan }),
    }).eq('id', agent.id)

    // Devolver dispositivos asignados a este agente
    const { data: devices } = await sb
      .from('bridge_devices')
      .select('id, nombre, tipo, ip_local, puerto, config_json, activo')
      .eq('bridge_token_id', agent.id)
      .eq('activo', true)

    return json({
      ok: true,
      agent_id: agent.id,
      restaurante_id: agent.restaurante_id,
      devices: devices ?? [],
      server_time: new Date().toISOString(),
    })
  }

  // ── GET /commands ────────────────────────────────────────────────
  // Agente pide comandos pendientes de sus devices
  if (seg === 'commands' && req.method === 'GET') {
    const agent = await getAgent(req)
    if (!agent) return json({ error: 'Token inválido o inactivo' }, 401)

    // IDs de devices de este agente
    const { data: devs } = await sb
      .from('bridge_devices')
      .select('id')
      .eq('bridge_token_id', agent.id)
      .eq('activo', true)

    if (!devs?.length) return json({ commands: [] })

    const deviceIds = devs.map((d: { id: string }) => d.id)

    // Comandos pendientes ordenados por prioridad desc, created_at asc
    const { data: commands } = await sb
      .from('bridge_commands')
      .select(`
        id, device_id, comando, payload, prioridad,
        bridge_devices(tipo, ip_local, puerto, config_json)
      `)
      .in('device_id', deviceIds)
      .eq('estado', 'pendiente')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('prioridad', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20)

    // Marcar como 'enviado' para no re-enviar en el siguiente poll
    if (commands?.length) {
      const ids = commands.map((c: { id: string }) => c.id)
      await sb
        .from('bridge_commands')
        .update({ estado: 'enviado' })
        .in('id', ids)
    }

    return json({ commands: commands ?? [] })
  }

  // ── POST /commands/:id/result ──────────────────────────────────────
  // Agente reporta resultado de un comando
  if (seg === 'result' && seg2 === 'commands') {
    // Formato: /bridge-agent/commands/:id/result  (el id es seg3)
    const cmdId = parts[parts.length - 2] // el UUID antes de /result
    const agent = await getAgent(req)
    if (!agent) return json({ error: 'Token inválido o inactivo' }, 401)

    const { ok, respuesta, error_msg } = await req.json().catch(() => ({}))
    const estado = ok ? 'ok' : 'error'

    await sb.from('bridge_commands').update({
      estado,
      respuesta: respuesta ?? null,
      completado_at: new Date().toISOString(),
    }).eq('id', cmdId)

    // Actualizar ultimo_estado del device
    const { data: cmd } = await sb
      .from('bridge_commands')
      .select('device_id')
      .eq('id', cmdId)
      .single()

    if (cmd) {
      await sb.from('bridge_devices').update({
        ultimo_estado: ok ? 'ok' : 'error',
        ultimo_ping: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(error_msg && !ok && { ultimo_error: error_msg }),
      }).eq('id', cmd.device_id)
    }

    return json({ ok: true })
  }

  // ── POST /commands/:id/result (ruta alternativa plana) ────────────────────
  // /bridge-agent/result/:id  — por si el agente usa esta forma
  if (seg2 === 'result') {
    const cmdId = seg
    const agent = await getAgent(req)
    if (!agent) return json({ error: 'Token inválido o inactivo' }, 401)

    const { ok, respuesta, error_msg } = await req.json().catch(() => ({}))
    const estado = ok ? 'ok' : 'error'

    await sb.from('bridge_commands').update({
      estado,
      respuesta: respuesta ?? null,
      completado_at: new Date().toISOString(),
    }).eq('id', cmdId)

    const { data: cmd } = await sb
      .from('bridge_commands')
      .select('device_id')
      .eq('id', cmdId)
      .single()

    if (cmd) {
      await sb.from('bridge_devices').update({
        ultimo_estado: ok ? 'ok' : 'error',
        ultimo_ping: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(error_msg && !ok && { ultimo_error: error_msg }),
      }).eq('id', cmd.device_id)
    }

    return json({ ok: true })
  }

  // ── POST /log-error ──────────────────────────────────────────────
  // Agente reporta un error general (no de un comando específico)
  if (seg === 'log-error' && req.method === 'POST') {
    const agent = await getAgent(req)
    if (!agent) return json({ error: 'Token inválido o inactivo' }, 401)
    const { error_msg } = await req.json().catch(() => ({}))
    if (error_msg) {
      await sb.from('bridge_tokens').update({
        ultimo_error: String(error_msg).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', agent.id)
    }
    return json({ ok: true })
  }

  return json({ error: 'Ruta no encontrada' }, 404)
})
