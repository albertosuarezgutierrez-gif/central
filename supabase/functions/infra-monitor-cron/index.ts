// ia.rest · infra-monitor-cron v1 (local_id)
// Monitorización proactiva de infraestructura — avisa al owner ANTES de que llame
// Corre cada 5 minutos via pg_cron job #16
//
// Detecta:
//   1. Bridge sin heartbeat > 10 min
//   2. 3+ errores críticos en los últimos 30 min
//   3. Turno activo sin comandas en más de 2 horas

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const PUSH_URL = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '') + '/functions/v1/push-send'
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DEDUP: Record<string, number> = {
  bridge_offline:   30,
  errores_criticos: 60,
  turno_inactivo:   120,
}

function minDesde(ts: string | null): number {
  if (!ts) return Infinity
  return (Date.now() - new Date(ts).getTime()) / 60000
}

async function yaAlertado(restauranteId: string, tipo: string): Promise<boolean> {
  const ventana = DEDUP[tipo] ?? 30
  const desde = new Date(Date.now() - ventana * 60 * 1000).toISOString()
  const { count } = await sb
    .from('alerta_log')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', restauranteId)
    .contains('trigger_tipos', [tipo])
    .gte('disparada_at', desde)
  return (count ?? 0) > 0
}

async function getOwnerIds(restauranteId: string): Promise<string[]> {
  const { data } = await sb
    .from('camareros')
    .select('id')
    .eq('local_id', restauranteId)
    .in('rol', ['owner', 'super_admin'])
    .eq('activo', true)
  return (data ?? []).map((c: { id: string }) => c.id)
}

async function enviarPush(camareroIds: string[], title: string, body: string) {
  if (!camareroIds.length) return
  await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SRK}` },
    body: JSON.stringify({ camarero_ids: camareroIds, title, body, mensaje_voz: body }),
  }).catch(e => console.error('[infra-push]', e))
}

async function registrarAlerta(restauranteId: string, tipo: string, mensaje: string) {
  await sb.from('alerta_log').insert({
    local_id: restauranteId,
    trigger_tipos: [tipo],
    mensaje_voz: mensaje,
    leida: false,
  }).catch(e => console.error('[infra-log]', e))
}

Deno.serve(async () => {
  const alertasDisparadas: string[] = []

  try {
    const { data: restaurantes } = await sb
      .from('restaurantes')
      .select('id, nombre')
      .eq('activo', true)
      .neq('id', '00000000-0000-0000-0000-000000000001')

    if (!restaurantes?.length) {
      return new Response(JSON.stringify({ ok: true, alertas: [] }), { status: 200 })
    }

    const rids = restaurantes.map((r: { id: string }) => r.id)
    const ridNombre = new Map(restaurantes.map((r: { id: string; nombre: string }) => [r.id, r.nombre]))

    // ── 1. Bridge sin heartbeat > 10 min ─────────────────────────────────────
    const { data: bridges } = await sb
      .from('bridge_tokens')
      .select('local_id, nombre, ultimo_ping')
      .in('local_id', rids)
      .eq('activo', true)

    for (const bridge of bridges ?? []) {
      const mins = minDesde(bridge.ultimo_ping)
      if (mins < 10) continue
      if (await yaAlertado(bridge.local_id, 'bridge_offline')) continue

      const ownerIds = await getOwnerIds(bridge.local_id)
      const nombre = ridNombre.get(bridge.local_id) ?? 'Restaurante'
      const minStr = mins === Infinity ? 'nunca' : `${Math.floor(mins)} minutos`
      const msg = `Aviso: el bridge de impresoras "${bridge.nombre}" lleva ${minStr} sin responder. Comprueba que el PC o tablet del local está encendido y con conexión.`

      await enviarPush(ownerIds, `${nombre} — Bridge offline`, msg)
      await registrarAlerta(bridge.local_id, 'bridge_offline', msg)
      alertasDisparadas.push(`bridge_offline: ${nombre}`)
      console.log(`[infra] bridge_offline ${nombre} (${minStr})`)
    }

    // ── 2. Errores críticos recientes ────────────────────────────────────────
    const hace30m = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: erroresCrit } = await sb
      .from('system_errors')
      .select('local_id')
      .in('local_id', rids)
      .eq('nivel', 'critical')
      .eq('resuelto', false)
      .gte('created_at', hace30m)

    const errPorR = new Map<string, number>()
    for (const e of erroresCrit ?? []) {
      if (!e.local_id) continue
      errPorR.set(e.local_id, (errPorR.get(e.local_id) ?? 0) + 1)
    }

    for (const [rid, count] of errPorR) {
      if (count < 3) continue
      if (await yaAlertado(rid, 'errores_criticos')) continue

      const ownerIds = await getOwnerIds(rid)
      const nombre = ridNombre.get(rid) ?? 'Restaurante'
      const msg = `Alerta: se han detectado ${count} errores críticos en los últimos 30 minutos en ${nombre}. Ve a Auditoría → Sistema para ver el detalle.`

      await enviarPush(ownerIds, `${nombre} — Errores en el sistema`, msg)
      await registrarAlerta(rid, 'errores_criticos', msg)
      alertasDisparadas.push(`errores_criticos: ${nombre} (${count})`)
      console.log(`[infra] errores_criticos ${nombre}: ${count}`)
    }

    // ── 3. Turno activo sin comandas en > 2 horas ────────────────────────────
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: turnos } = await sb
      .from('turnos')
      .select('id, local_id, created_at')
      .in('local_id', rids)
      .eq('estado', 'activo')
      .lt('created_at', hace2h)

    for (const turno of turnos ?? []) {
      const { count } = await sb
        .from('comandas')
        .select('id', { count: 'exact', head: true })
        .eq('local_id', turno.local_id)
        .gte('created_at', hace2h)

      if ((count ?? 0) > 0) continue
      if (await yaAlertado(turno.local_id, 'turno_inactivo')) continue

      const ownerIds = await getOwnerIds(turno.local_id)
      const nombre = ridNombre.get(turno.local_id) ?? 'Restaurante'
      const horas = Math.floor(minDesde(turno.created_at) / 60)
      const msg = `Aviso: el turno de ${nombre} lleva ${horas} horas abierto sin actividad. Si el servicio ha terminado, cierra el turno desde /owner → Servicio → Turno.`

      await enviarPush(ownerIds, `${nombre} — Turno sin actividad`, msg)
      await registrarAlerta(turno.local_id, 'turno_inactivo', msg)
      alertasDisparadas.push(`turno_inactivo: ${nombre} (${horas}h)`)
      console.log(`[infra] turno_inactivo ${nombre}: ${horas}h`)
    }

    return new Response(
      JSON.stringify({ ok: true, total: alertasDisparadas.length, alertas: alertasDisparadas }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[infra-monitor-cron]', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
