// monitor-health — Edge Function v2
// pg_cron: cada 5 minutos
//
// AUTO-HEALER checks:
//  ── TIER 1 (siempre activos) ───────────────────────────────────────────────
//   1. Bridge offline > 15/30 min → notifica
//   2. Comandas sin print_job > 3 min → reencola
//   3. Print jobs fallidos >= 3 → resetea a pendiente
//   4. Sesiones zombie > 24h → borra
//   5. 86s del turno anterior → limpia
//
//  ── TIER 2 (modo madrugada, 02:00-08:00 o fuera de turno) ─────────────────
//   6. Mesas "activa" > 8h sin comanda activa → reset a libre
//   7. Turnos de fichaje abiertos > 14h → cierre automático
//   8. Productos con precio 0 activos → aviso
//
//  ── MEMORIA DE FALLOS ─────────────────────────────────────────────────────
//   9. Si mismo tipo de fallo > 3 veces en 1h → escalar nivel a crítico
//  10. Patrones horarios: mismo fallo en mismo slot 3+ veces → aviso preventivo
//
//  ── TRAINING FEEDBACK ─────────────────────────────────────────────────────
//  11. Cada curación exitosa → ia_training_log (fuente: auto_healer, calidad: 4)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase     = createClient(SUPABASE_URL, SERVICE_KEY)

  const resultados: Record<string, unknown> = {}
  const horaActual  = new Date().getUTCHours() + 2 // UTC+2 España peninsular
  const esMadrugada = horaActual >= 2 && horaActual <= 8

  // ── HELPER: notificar incidencia (sin duplicar en última hora) ─────────────
  async function notificar(inc: {
    tipo: string; modulo: string; mensaje: string
    detalle?: Record<string, unknown>; restaurante_id?: string | null
    nivel: string; auto_resuelta?: boolean
  }) {
    const { count } = await supabase
      .from('incidencias_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', inc.tipo)
      .eq('restaurante_id', inc.restaurante_id ?? null)
      .eq('resuelta', false)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if ((count ?? 0) > 0) return

    await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(inc),
    })
  }

  // ── HELPER: registrar curación + training log ──────────────────────────────
  async function registrarCuracion(params: {
    tipo: string; modulo: string; mensaje: string
    detalle?: Record<string, unknown>; restaurante_id?: string | null
  }) {
    // 1. Marcar incidencias previas no resueltas del mismo tipo como resueltas
    await supabase
      .from('incidencias_sistema')
      .update({ resuelta: true, auto_resuelta: true, resuelta_at: new Date().toISOString(), resuelta_por: 'auto' })
      .eq('tipo', params.tipo)
      .eq('restaurante_id', params.restaurante_id ?? null)
      .eq('resuelta', false)

    // 2. Insertar registro de resolución
    await supabase.from('incidencias_sistema').insert({
      tipo: params.tipo + '_resuelto',
      modulo: params.modulo,
      nivel: 'resuelto',
      mensaje: `⚡ Auto-fix: ${params.mensaje}`,
      detalle: params.detalle ?? {},
      restaurante_id: params.restaurante_id ?? null,
      resuelta: true,
      auto_resuelta: true,
      resuelta_at: new Date().toISOString(),
      resuelta_por: 'auto',
    })

    // 3. Training log: cada curación = dato de aprendizaje
    try {
      await supabase.from('ia_training_log').insert({
        restaurante_id: params.restaurante_id ?? null,
        tipo: 'auto_healer',
        fuente: 'auto_healer',
        input: params.mensaje,
        output: JSON.stringify(params.detalle ?? {}),
        calidad: 4,
        resuelto: true,
        created_at: new Date().toISOString(),
      })
    } catch (_) { /* ia_training_log puede no tener todas las columnas — no es crítico */ }

    // 4. Notificar resolución a Telegram (verde)
    await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        tipo: params.tipo + '_resuelto',
        nivel: 'resuelto',
        auto_resuelta: true,
        mensaje: `⚡ Auto-fix: ${params.mensaje}`,
      }),
    })
  }

  // ── CHECK 1: Bridges offline ───────────────────────────────────────────────
  try {
    const { data: bridges } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id, ultimo_ping, activo')
      .eq('activo', true)
      .not('ultimo_ping', 'is', null)

    let bridgesOffline = 0
    const ahora = Date.now()

    for (const b of bridges ?? []) {
      const min = (ahora - new Date(b.ultimo_ping).getTime()) / 60000
      if (min < 15) continue
      bridgesOffline++

      await notificar({
        tipo: 'bridge_offline',
        modulo: 'bridge',
        mensaje: `Bridge desconectado hace ${Math.round(min)} min`,
        detalle: { ultimo_ping: b.ultimo_ping, minutos: Math.round(min) },
        restaurante_id: b.restaurante_id,
        nivel: min > 60 ? 'critico' : 'aviso',
      })
    }
    resultados.bridges_offline = bridgesOffline
  } catch (e) { console.error('Check bridges:', e) }

  // ── CHECK 2: Comandas sin print_job > 3 min → reencolar ───────────────────
  try {
    const tresMinAtras = new Date(Date.now() - 3 * 60 * 1000).toISOString()

    const { data: comandasSinPrint } = await supabase
      .from('comandas')
      .select('id, restaurante_id, created_at, nombre_cuenta, mesa:mesas(codigo)')
      .eq('estado', 'nueva')
      .lt('created_at', tresMinAtras)

    let reencoladas = 0

    for (const comanda of comandasSinPrint ?? []) {
      const { count: jobCount } = await supabase
        .from('print_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('comanda_id', comanda.id)

      if ((jobCount ?? 0) > 0) continue

      const { error: reencolarError } = await supabase.rpc('reencolar_comanda', {
        p_comanda_id: comanda.id,
      })

      const mesaLabel = (comanda.mesa as any)?.codigo ?? comanda.nombre_cuenta ?? 'desconocida'

      if (!reencolarError) {
        reencoladas++
        await registrarCuracion({
          tipo: 'comanda_sin_imprimir',
          modulo: 'comanda',
          mensaje: `Comanda mesa ${mesaLabel} reimpresa automáticamente`,
          detalle: { comanda_id: comanda.id, created_at: comanda.created_at },
          restaurante_id: comanda.restaurante_id,
        })
      } else {
        await notificar({
          tipo: 'comanda_sin_imprimir',
          modulo: 'comanda',
          mensaje: `Comanda mesa ${mesaLabel} sin imprimir > 3 min — no se pudo auto-fix`,
          detalle: { comanda_id: comanda.id, error: reencolarError.message },
          restaurante_id: comanda.restaurante_id,
          nivel: 'aviso',
        })
      }
    }
    resultados.comandas_reencoladas = reencoladas
  } catch (e) { console.error('Check comandas sin print:', e) }

  // ── CHECK 3: Print jobs con >= 3 fallos → resetear ─────────────────────────
  try {
    const { data: jobsFallidos } = await supabase
      .from('print_jobs')
      .select('id, restaurante_id, comanda_id, attempts, error_msg')
      .eq('status', 'error')
      .gte('attempts', 3)
      .lt('attempts', 6)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    let reseteados = 0
    for (const job of jobsFallidos ?? []) {
      await supabase
        .from('print_jobs')
        .update({ status: 'pendiente', error_msg: null })
        .eq('id', job.id)
      reseteados++

      await registrarCuracion({
        tipo: 'print_job_reseteado',
        modulo: 'bridge',
        mensaje: `Print job reseteado a pendiente (intento ${job.attempts + 1})`,
        detalle: { job_id: job.id, intentos_anteriores: job.attempts, error: job.error_msg },
        restaurante_id: job.restaurante_id,
      })
    }

    // Jobs con >= 6 fallos → alerta crítica
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

  // ── CHECK 4: Sesiones zombie > 24h → borrar ────────────────────────────────
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

  // ── CHECK 5: 86s del turno anterior → limpiar ─────────────────────────────
  // Un turno de servicio = el de la fila 'servicio' (camarero_id IS NULL) activo
  // Si ya hay un turno activo nuevo y hay 86s viejos, limpiarlos
  try {
    // Buscar turno de servicio activo actual por restaurante
    const { data: restaurantes } = await supabase
      .from('restaurantes')
      .select('id')
      .eq('activo', true)

    let ochentaSeisLimpiados = 0

    for (const rest of restaurantes ?? []) {
      // Turno de servicio activo
      const { data: turnoActivo } = await supabase
        .from('turnos')
        .select('id, entrada_at')
        .eq('restaurante_id', rest.id)
        .is('camarero_id', null)
        .is('salida_at', null)
        .order('entrada_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!turnoActivo) continue

      // 86s más viejos que el turno activo actual (del turno anterior)
      const { data: ochoSeis } = await supabase
        .from('productos_86')
        .select('id')
        .eq('restaurante_id', rest.id)
        .lt('created_at', turnoActivo.entrada_at)

      if ((ochoSeis?.length ?? 0) > 0) {
        const ids = ochoSeis!.map(p => p.id)
        await supabase.from('productos_86').delete().in('id', ids)
        ochentaSeisLimpiados += ids.length

        await registrarCuracion({
          tipo: '86_turno_anterior_limpiado',
          modulo: 'carta',
          mensaje: `${ids.length} productos "86" del turno anterior limpiados`,
          detalle: { restaurante_id: rest.id, cantidad: ids.length },
          restaurante_id: rest.id,
        })
      }
    }
    resultados.ochenta_seis_limpiados = ochentaSeisLimpiados
  } catch (e) { console.error('Check 86s:', e) }

  // ── CHECK 6: Mesas zombie (activa > 8h sin comanda activa) → reset ─────────
  // Solo en madrugada (02:00-08:00) para no interferir con servicio
  if (esMadrugada) {
    try {
      const ochoHorasAtras = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()

      const { data: mesasZombie } = await supabase
        .from('mesas')
        .select('id, codigo, restaurante_id, ocupada_desde')
        .in('estado', ['activa', 'marchar', 'aviso'])
        .lt('ocupada_desde', ochoHorasAtras)

      let mesasReseteadas = 0

      for (const mesa of mesasZombie ?? []) {
        // Verificar que no tenga comanda activa reciente
        const { count: comandasActivas } = await supabase
          .from('comandas')
          .select('id', { count: 'exact', head: true })
          .eq('mesa_id', mesa.id)
          .in('estado', ['nueva', 'en_curso'])

        if ((comandasActivas ?? 0) > 0) continue // tiene comanda activa, no tocar

        await supabase
          .from('mesas')
          .update({ estado: 'libre', camarero_id: null, ocupada_desde: null })
          .eq('id', mesa.id)

        mesasReseteadas++

        await registrarCuracion({
          tipo: 'mesa_zombie_reseteada',
          modulo: 'sala',
          mensaje: `Mesa ${mesa.codigo} reseteada a libre (estaba activa >8h sin comanda)`,
          detalle: { mesa_id: mesa.id, codigo: mesa.codigo, ocupada_desde: mesa.ocupada_desde },
          restaurante_id: mesa.restaurante_id,
        })
      }
      resultados.mesas_zombie_reseteadas = mesasReseteadas
    } catch (e) { console.error('Check mesas zombie:', e) }
  }

  // ── CHECK 7: Turnos fichaje abiertos > 14h → cierre automático ─────────────
  // Solo en madrugada para mayor seguridad
  if (esMadrugada) {
    try {
      const catorceHorasAtras = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString()

      const { data: turnosAbiertos } = await supabase
        .from('turnos')
        .select('id, restaurante_id, camarero_id, entrada_at')
        .not('camarero_id', 'is', null)  // solo fichaje individual
        .is('salida_at', null)
        .lt('entrada_at', catorceHorasAtras)

      let turnosCerrados = 0

      for (const turno of turnosAbiertos ?? []) {
        await supabase
          .from('turnos')
          .update({
            salida_at: new Date().toISOString(),
            estado: 'cerrado',
            notas: 'Cierre automático por inactividad >14h (Auto-Healer)',
          })
          .eq('id', turno.id)

        turnosCerrados++

        await registrarCuracion({
          tipo: 'turno_fichaje_cerrado',
          modulo: 'fichaje',
          mensaje: `Turno de fichaje cerrado automáticamente (>14h abierto)`,
          detalle: { turno_id: turno.id, entrada_at: turno.entrada_at, camarero_id: turno.camarero_id },
          restaurante_id: turno.restaurante_id,
        })
      }
      resultados.turnos_fichaje_cerrados = turnosCerrados
    } catch (e) { console.error('Check turnos fichaje:', e) }
  }

  // ── CHECK 8: Productos con precio 0 activos → aviso ───────────────────────
  try {
    const { data: productosGratis } = await supabase
      .from('productos')
      .select('id, nombre, restaurante_id, precio')
      .eq('activo', true)
      .or('precio.eq.0,precio.is.null')

    // Solo avisar si es un restaurante con turno activo (evitar avisar en setup)
    for (const prod of productosGratis ?? []) {
      const { count: turnoActivo } = await supabase
        .from('turnos')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', prod.restaurante_id)
        .is('camarero_id', null)
        .is('salida_at', null)

      if ((turnoActivo ?? 0) === 0) continue // no hay turno activo, es setup

      await notificar({
        tipo: 'producto_precio_cero',
        modulo: 'carta',
        mensaje: `Producto "${prod.nombre}" tiene precio 0 o sin precio y está activo en carta`,
        detalle: { producto_id: prod.id, nombre: prod.nombre, precio: prod.precio },
        restaurante_id: prod.restaurante_id,
        nivel: 'aviso',
      })
    }
    resultados.productos_precio_cero = productosGratis?.length ?? 0
  } catch (e) { console.error('Check productos precio 0:', e) }

  // ── CHECK 9: Memoria de fallos — misma incidencia > 3 veces en 1h → escalar
  try {
    const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: fallosRepetidos } = await supabase
      .from('incidencias_sistema')
      .select('tipo, restaurante_id, modulo')
      .eq('resuelta', false)
      .gte('created_at', unaHoraAtras)

    // Agrupar manualmente
    const conteo: Record<string, { count: number; modulo: string; restaurante_id: string | null }> = {}
    for (const f of fallosRepetidos ?? []) {
      const key = `${f.tipo}:${f.restaurante_id ?? 'global'}`
      if (!conteo[key]) conteo[key] = { count: 0, modulo: f.modulo, restaurante_id: f.restaurante_id }
      conteo[key].count++
    }

    let escalados = 0
    for (const [key, val] of Object.entries(conteo)) {
      if (val.count < 3) continue
      const tipo = key.split(':')[0]
      escalados++

      await notificar({
        tipo: `${tipo}_patron_repetido`,
        modulo: val.modulo,
        mensaje: `Fallo "${tipo}" repetido ${val.count} veces en la última hora — posible problema sistémico`,
        detalle: { tipo, repeticiones: val.count, ventana: '1h' },
        restaurante_id: val.restaurante_id,
        nivel: 'critico',
      })
    }
    resultados.patrones_escalados = escalados
  } catch (e) { console.error('Check memoria fallos:', e) }

  // ── CHECK 10: Patrones horarios preventivos ────────────────────────────────
  // Si hoy es el mismo día/hora que fallos recurrentes en últimas 4 semanas → aviso preventivo
  try {
    const diaHoy    = new Date().getDay()    // 0=domingo
    const horaActual2 = new Date().getHours()

    const { data: patronesFrecuentes } = await supabase
      .from('incidencias_sistema')
      .select('tipo, modulo, restaurante_id, dia_semana, hora_dia')
      .eq('dia_semana', diaHoy)
      .eq('hora_dia', horaActual2)
      .gte('created_at', new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString())

    // Agrupar por tipo+restaurante
    const patronConteo: Record<string, { count: number; modulo: string; restaurante_id: string | null }> = {}
    for (const p of patronesFrecuentes ?? []) {
      const key = `${p.tipo}:${p.restaurante_id ?? 'global'}`
      if (!patronConteo[key]) patronConteo[key] = { count: 0, modulo: p.modulo, restaurante_id: p.restaurante_id }
      patronConteo[key].count++
    }

    let avisosPreventivos = 0
    for (const [key, val] of Object.entries(patronConteo)) {
      if (val.count < 3) continue
      const tipo = key.split(':')[0]
      const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']

      await notificar({
        tipo: `${tipo}_aviso_preventivo`,
        modulo: val.modulo,
        mensaje: `Aviso preventivo: "${tipo}" suele ocurrir los ${diasSemana[diaHoy]} a las ${horaActual2}h (${val.count} veces en 4 semanas)`,
        detalle: { tipo, ocurrencias_historicas: val.count, dia: diasSemana[diaHoy], hora: horaActual2 },
        restaurante_id: val.restaurante_id,
        nivel: 'info',
      })
      avisosPreventivos++
    }
    resultados.avisos_preventivos = avisosPreventivos
  } catch (e) { console.error('Check patrones horarios:', e) }

  // ── CHECK 11: Desincronización print_jobs/comanda_items ───────────────────
  // print_job IMPRESO pero comanda_items aún PENDIENTE → auto-sincronizar
  // Causa: bug en ack handler cuando seccion_id era null (ya corregido en código)
  // El healer actúa como red de seguridad para jobs ya ackeados antes del fix
  try {
    const treintaMinAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    // Buscar jobs impresos con items aún pendientes (excluir tipo 'cambio')
    const { data: jobsDesync } = await supabase
      .from('print_jobs')
      .select('id, comanda_id, restaurante_id, payload, acked_at')
      .eq('status', 'impreso')
      .not('comanda_id', 'is', null)
      .gte('acked_at', treintaMinAtras)

    let itemsSincronizados = 0

    for (const job of jobsDesync ?? []) {
      const tipo = (job.payload as Record<string, unknown>)?.tipo as string || 'comanda'
      if (tipo === 'cambio') continue

      // Comprobar si hay items pendientes en esta comanda
      const { count: pendientes } = await supabase
        .from('comanda_items')
        .select('id', { count: 'exact', head: true })
        .eq('comanda_id', job.comanda_id)
        .eq('print_status', 'pendiente')
        .is('eliminado_at', null)

      if ((pendientes ?? 0) === 0) continue

      // Auto-fix: marcar items como impresos usando nombres del payload
      const itemsEnJob = ((job.payload as Record<string, unknown>)?.items as Array<{ nombre: string }> ?? [])
        .map((i: { nombre: string }) => i.nombre)

      let query = supabase.from('comanda_items')
        .update({ print_status: 'impreso', printed_at: job.acked_at })
        .eq('comanda_id', job.comanda_id)
        .eq('print_status', 'pendiente')
        .is('eliminado_at', null)
        .not('estado_item', 'eq', 'cancelado')

      if (itemsEnJob.length > 0) {
        query = query.in('nombre', itemsEnJob)
      }

      const { error: syncErr } = await query

      if (!syncErr) {
        itemsSincronizados += pendientes ?? 0
        await registrarCuracion({
          tipo: 'print_status_desync',
          modulo: 'bridge',
          mensaje: `${pendientes} items sincronizados a impreso (job acked pero items pendientes)`,
          detalle: { job_id: job.id, comanda_id: job.comanda_id, items_sync: pendientes },
          restaurante_id: job.restaurante_id,
        })
      }
    }
    resultados.items_desync_sincronizados = itemsSincronizados
  } catch (e) { console.error('Check desync print_status:', e) }

  // ── CHECK 12: Jobs de tipo 'cambio' sin ackear > 2 min → alerta manual ─────
  // Si la impresora no recibe el ticket de anulación, cocina podría seguir
  // preparando un pedido ya cancelado. Alertar para intervención manual.
  try {
    const dosMinAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const { data: cambiosSinAck } = await supabase
      .from('print_jobs')
      .select('id, comanda_id, restaurante_id, created_at')
      .in('status', ['pendiente', 'encolado'])
      .lt('created_at', dosMinAtras)
      .filter('payload->>tipo', 'eq', 'cambio')

    for (const job of cambiosSinAck ?? []) {
      const minutos = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000)

      await notificar({
        tipo: 'cambio_sin_confirmar',
        modulo: 'bridge',
        mensaje: `Cambio/anulación no confirmado por impresora (${minutos} min) — avisa a cocina manualmente`,
        detalle: { job_id: job.id, comanda_id: job.comanda_id, minutos },
        restaurante_id: job.restaurante_id,
        nivel: minutos > 5 ? 'critico' : 'aviso',
      })
    }
    resultados.cambios_sin_ack = cambiosSinAck?.length ?? 0
  } catch (e) { console.error('Check cambios sin ack:', e) }

  // ── CHECK 13: Jobs pendientes con bridge activo → diagnóstico automático ───
  // Detecta el bug del enum u otros problemas que bloquean silenciosamente los jobs
  // Síntoma: bridge master activo + jobs pendientes attempts=0 > 5 min
  try {
    const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    // ¿Hay bridge master activo?
    const { data: bridgeMaster } = await supabase
      .from('bridge_tokens')
      .select('id, restaurante_id, rol, ultimo_ping, bridge_version')
      .eq('activo', true)
      .eq('rol', 'master')
      .gt('ultimo_ping', new Date(Date.now() - 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle()

    if (bridgeMaster) {
      // ¿Hay jobs pendientes bloqueados (attempts=0, > 5min)?
      const { count: jobsBloqueados } = await supabase
        .from('print_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', bridgeMaster.restaurante_id)
        .eq('status', 'pendiente')
        .eq('attempts', 0)
        .lt('created_at', cincoMinAtras)

      if ((jobsBloqueados ?? 0) > 0) {
        // Diagnóstico: bridge activo pero no procesa jobs → problema de configuración
        // Intentar auto-fix: limpiar jobs encolados zombies para forzar reproceso
        await supabase
          .from('print_jobs')
          .update({ status: 'pendiente' })
          .eq('restaurante_id', bridgeMaster.restaurante_id)
          .eq('status', 'encolado')
          .eq('attempts', 0)
          .lt('created_at', cincoMinAtras)

        await notificar({
          tipo: 'jobs_bloqueados_bridge_activo',
          modulo: 'bridge',
          mensaje: `${jobsBloqueados} jobs pendientes sin procesar con bridge activo (bridge v${bridgeMaster.bridge_version}) — posible incompatibilidad de configuración`,
          detalle: {
            jobs_bloqueados: jobsBloqueados,
            bridge_version: bridgeMaster.bridge_version,
            bridge_ultimo_ping: bridgeMaster.ultimo_ping,
            sugerencia: 'Verificar connection_type de impresoras y enum printer_connection_type en BD'
          },
          restaurante_id: bridgeMaster.restaurante_id,
          nivel: 'critico',
        })
      }
    }
    resultados.jobs_bloqueados_bridge_activo = bridgeMaster ? 'verificado' : 'sin_bridge_master'
  } catch (e) { console.error('Check jobs bloqueados:', e) }

  // ── CHECK 14: Validación enum printer_connection_type ─────────────────────
  // Detecta si hay impresoras con connection_type no reconocido por el sistema
  // (el bug del enum 'tcp' bloqueó toda la impresión durante horas)
  try {
    const TIPOS_VALIDOS = ['ip_local', 'usb_bridge', 'tcp', 'star_cloudprnt']

    const { data: impresoras } = await supabase
      .from('impresoras')
      .select('id, nombre, connection_type, restaurante_id')
      .eq('activa', true)

    const tiposDesconocidos = (impresoras ?? []).filter(
      i => !TIPOS_VALIDOS.includes(i.connection_type)
    )

    if (tiposDesconocidos.length > 0) {
      for (const imp of tiposDesconocidos) {
        await notificar({
          tipo: 'connection_type_desconocido',
          modulo: 'bridge',
          mensaje: `Impresora "${imp.nombre}" tiene connection_type="${imp.connection_type}" no reconocido — no recibirá jobs`,
          detalle: { impresora_id: imp.id, connection_type: imp.connection_type, tipos_validos: TIPOS_VALIDOS },
          restaurante_id: imp.restaurante_id,
          nivel: 'critico',
        })
      }
    }
    resultados.impresoras_tipo_desconocido = tiposDesconocidos.length
  } catch (e) { console.error('Check enum connection_type:', e) }


    ok: true,
    timestamp: new Date().toISOString(),
    modo: esMadrugada ? 'madrugada' : 'servicio',
    ...resultados,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
