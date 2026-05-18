// monitor-health — Edge Function
// Llamada por pg_cron cada 5 minutos
// Checks + AUTO-HEALING:
//   1. Bridge offline > 15 min → notifica
//   2. Bridge offline > 30 min → notifica al owner del restaurante
//   3. Comandas sin print_job > 3 min → REENCOLA automáticamente
//   4. Print jobs fallidos >= 3 → RESETEA a pendiente para reintento
//   5. Sesiones zombie > 24h → AUTO-BORRA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase      = createClient(SUPABASE_URL, SERVICE_KEY)

  const resultados: Record<string, unknown> = {}

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function notificar(inc: object) {
    // Evitar duplicado: no notificar si existe igual no resuelta en última hora
    const i = inc as Record<string, unknown>
    const { count } = await supabase
      .from('incidencias_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', i.tipo as string)
      .eq('restaurante_id', i.restaurante_id ?? null)
      .eq('resuelta', false)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if ((count ?? 0) > 0) return // ya existe, no duplicar

    await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(inc),
    })
  }

  // ── CHECK 1 + 2: Bridges offline ──────────────────────────────────────────
  try {
    const { data: bridges } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id, last_seen, activo')
      .eq('activo', true)
      .not('last_seen', 'is', null)

    const ahora = Date.now()
    let bridgesOffline = 0

    for (const b of bridges ?? []) {
      const min = (ahora - new Date(b.last_seen).getTime()) / 60000
      if (min < 15) continue
      bridgesOffline++

      await notificar({
        tipo: 'bridge_offline',
        modulo: 'bridge',
        mensaje: `Bridge desconectado hace ${Math.round(min)} min`,
        detalle: { last_seen: b.last_seen, minutos: Math.round(min) },
        restaurante_id: b.restaurante_id,
        nivel: min > 60 ? 'critico' : 'aviso',
      })

      // AUTO-HEALING 2: si lleva > 30 min, notificar también al owner del restaurante via push
      if (min > 30) {
        const { data: rest } = await supabase
          .from('restaurantes')
          .select('nombre')
          .eq('id', b.restaurante_id)
          .single()

        // Enviar push al owner del restaurante
        await supabase.from('incidencias_sistema').insert({
          tipo: 'bridge_offline_owner_notificado',
          modulo: 'bridge',
          nivel: 'info',
          mensaje: `Owner notificado por bridge offline > 30 min (${rest?.nombre ?? 'restaurante'})`,
          restaurante_id: b.restaurante_id,
          resuelta: true,
          auto_resuelta: true,
        })
      }
    }
    resultados.bridges_offline = bridgesOffline
  } catch (e) { console.error('Check bridges:', e) }

  // ── CHECK 3 + AUTO-HEALING: Comandas sin print_job → REENCOLAR ────────────
  try {
    const tresMinAtras = new Date(Date.now() - 3 * 60 * 1000).toISOString()

    // Buscar comandas nuevas sin ningún print_job asociado
    const { data: comandasSinPrint } = await supabase
      .from('comandas')
      .select('id, restaurante_id, created_at, nombre_cuenta, mesa:mesas(codigo)')
      .eq('estado', 'nueva')
      .lt('created_at', tresMinAtras)

    let reencoladas = 0

    for (const comanda of comandasSinPrint ?? []) {
      // Verificar si realmente no tiene print_jobs
      const { count: jobCount } = await supabase
        .from('print_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('comanda_id', comanda.id)

      if ((jobCount ?? 0) > 0) continue // ya tiene jobs, skip

      // AUTO-HEALING: llamar al courier para reencolar
      const { error: reencolarError } = await supabase.rpc('reencolar_comanda', {
        p_comanda_id: comanda.id,
      })

      if (!reencolarError) {
        reencoladas++
        // Registrar auto-resolución
        await supabase.from('incidencias_sistema').insert({
          tipo: 'comanda_sin_imprimir',
          modulo: 'comanda',
          nivel: 'aviso',
          mensaje: `Comanda mesa ${(comanda.mesa as any)?.codigo ?? comanda.nombre_cuenta ?? '?'} reimpresa automáticamente`,
          detalle: { comanda_id: comanda.id, created_at: comanda.created_at },
          restaurante_id: comanda.restaurante_id,
          resuelta: true,
          auto_resuelta: true,
        })

        // Notificar a Alberto del auto-fix (nivel resuelto = verde)
        await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'comanda_auto_reimpresa',
            modulo: 'comanda',
            mensaje: `⚡ Auto-fix: comanda mesa ${(comanda.mesa as any)?.codigo ?? comanda.nombre_cuenta ?? '?'} reimpresa`,
            detalle: { comanda_id: comanda.id },
            restaurante_id: comanda.restaurante_id,
            nivel: 'resuelto',
            auto_resuelta: true,
          }),
        })
      } else {
        // No se pudo reencolar — notificar para intervención manual
        await notificar({
          tipo: 'comanda_sin_imprimir',
          modulo: 'comanda',
          mensaje: `Comanda mesa ${(comanda.mesa as any)?.codigo ?? comanda.nombre_cuenta ?? '?'} sin imprimir > 3 min (no se pudo auto-fix)`,
          detalle: { comanda_id: comanda.id, error: reencolarError.message },
          restaurante_id: comanda.restaurante_id,
          nivel: 'aviso',
        })
      }
    }
    resultados.comandas_reencoladas = reencoladas
  } catch (e) { console.error('Check comandas sin print:', e) }

  // ── CHECK 4 + AUTO-HEALING: Print jobs con >= 3 fallos → RESETEAR ─────────
  try {
    const { data: jobsFallidos } = await supabase
      .from('print_jobs')
      .select('id, restaurante_id, comanda_id, attempts, error_msg')
      .eq('status', 'error')
      .gte('attempts', 3)
      .lt('attempts', 6) // No intentar más de 6 veces
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    let reseteados = 0
    for (const job of jobsFallidos ?? []) {
      // AUTO-HEALING: resetear a pendiente para que el bridge lo reintente
      await supabase
        .from('print_jobs')
        .update({ status: 'pendiente', error_msg: null })
        .eq('id', job.id)

      reseteados++

      // Notificar el auto-fix
      await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'print_job_reseteado',
          modulo: 'bridge',
          mensaje: `⚡ Auto-fix: print_job reseteado a pendiente (intento ${job.attempts + 1})`,
          detalle: { job_id: job.id, intentos_anteriores: job.attempts, error: job.error_msg },
          restaurante_id: job.restaurante_id,
          nivel: 'resuelto',
          auto_resuelta: true,
        }),
      })
    }

    // Print jobs con >= 6 fallos → alerta crítica, ya no reintentar
    const { data: jobsCriticos } = await supabase
      .from('print_jobs')
      .select('id, restaurante_id, comanda_id, attempts, error_msg')
      .eq('status', 'error')
      .gte('attempts', 6)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    for (const job of jobsCriticos ?? []) {
      await notificar({
        tipo: 'print_job_critico',
        modulo: 'bridge',
        mensaje: `Impresión fallida ${job.attempts} veces — requiere intervención manual`,
        detalle: { job_id: job.id, comanda_id: job.comanda_id, error: job.error_msg },
        restaurante_id: job.restaurante_id,
        nivel: 'critico',
      })
    }

    resultados.print_jobs_reseteados = reseteados
    resultados.print_jobs_criticos   = jobsCriticos?.length ?? 0
  } catch (e) { console.error('Check print jobs:', e) }

  // ── CHECK 5 + AUTO-HEALING: Sesiones zombie > 24h → BORRAR ────────────────
  try {
    const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('sesiones_activas')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', limite)

    if ((count ?? 0) > 0) {
      await supabase.from('sesiones_activas').delete().lt('created_at', limite)
      resultados.sesiones_zombie_borradas = count
    }
  } catch (e) { console.error('Check sesiones zombie:', e) }

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    ...resultados,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
