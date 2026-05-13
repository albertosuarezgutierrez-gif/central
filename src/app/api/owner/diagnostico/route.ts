// src/app/api/owner/diagnostico/route.ts
// GET /api/owner/diagnostico — estado del sistema para este restaurante
// Usado por DiagnosticoTab en /owner y /jefe para autodiagnóstico sin llamar a soporte

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

const sb = () => createServerClient()

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const ahora = Date.now()
  const hace24h = new Date(ahora - 24 * 60 * 60 * 1000).toISOString()
  const hace1h  = new Date(ahora - 60 * 60 * 1000).toISOString()

  try {
    // ── 1. Bridge tokens y heartbeat ─────────────────────────────
    const { data: bridges } = await sb()
      .from('bridge_tokens')
      .select('id, nombre, activo, ultimo_ping')
      .eq('restaurante_id', rid)
      .eq('activo', true)

    const bridgeStatus = (bridges ?? []).map(b => {
      const ping = b.ultimo_ping ? new Date(b.ultimo_ping).getTime() : null
      const minutos = ping ? Math.floor((ahora - ping) / 60000) : null
      const ok = minutos !== null && minutos < 5
      return {
        nombre: b.nombre,
        ultimo_ping: b.ultimo_ping,
        minutos_desde_ping: minutos,
        ok,
        estado: ok ? 'online'
          : minutos === null ? 'sin_actividad'
          : minutos < 30 ? 'advertencia'
          : 'offline',
      }
    })

    // ── 2. Últimas 15 comandas (con estado y tiempos) ─────────────
    const { data: comandas } = await sb()
      .from('comandas')
      .select('id, estado, created_at, updated_at, mesas(codigo)')
      .eq('restaurante_id', rid)
      .gte('created_at', hace24h)
      .order('created_at', { ascending: false })
      .limit(15)

    // ── 3. Errores recientes de este restaurante ──────────────────
    const { data: errores } = await sb()
      .from('system_errors')
      .select('id, nivel, categoria, mensaje, funcion_origen, created_at, resuelto')
      .eq('restaurante_id', rid)
      .eq('resuelto', false)
      .order('created_at', { ascending: false })
      .limit(10)

    // ── 4. Errores globales (sin restaurante_id) última hora ───────
    const { data: erroresGlobales } = await sb()
      .from('system_errors')
      .select('id, nivel, categoria, mensaje, created_at')
      .is('restaurante_id', null)
      .eq('resuelto', false)
      .gte('created_at', hace1h)
      .order('created_at', { ascending: false })
      .limit(5)

    // ── 5. Impresoras configuradas ────────────────────────────────
    const { data: impresoras } = await sb()
      .from('impresoras')
      .select('id, nombre, activa, configurada, ultimo_ping, connection_type')
      .eq('restaurante_id', rid)

    // ── 6. Resumen del turno activo ───────────────────────────────
    const { data: turno } = await sb()
      .from('turnos')
      .select('id, nombre, estado, created_at')
      .eq('restaurante_id', rid)
      .eq('estado', 'activo')
      .maybeSingle()

    // ── Calcular estado general ───────────────────────────────────
    const errorCritico = (errores ?? []).some(e => e.nivel === 'critical')
      || (erroresGlobales ?? []).some(e => e.nivel === 'critical')

    const bridgeOffline = bridgeStatus.some(b => b.estado === 'offline')

    const estadoGeneral: 'ok' | 'advertencia' | 'error' =
      errorCritico ? 'error'
      : bridgeOffline ? 'advertencia'
      : 'ok'

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      estado_general: estadoGeneral,
      turno_activo: turno ?? null,
      bridge: {
        tokens: bridgeStatus,
        hay_bridge: bridges && bridges.length > 0,
      },
      comandas: {
        ultimas: (comandas ?? []).map(c => ({
          id: c.id,
          mesa: (c.mesas as unknown as { codigo: string } | null)?.codigo ?? '—',
          estado: c.estado,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        total_24h: comandas?.length ?? 0,
      },
      errores: {
        propios: errores ?? [],
        globales_ultima_hora: erroresGlobales ?? [],
        total_pendientes: (errores ?? []).length,
      },
      impresoras: (impresoras ?? []).map(imp => ({
        nombre: imp.nombre,
        activa: imp.activa,
        configurada: imp.configurada,
        connection_type: imp.connection_type,
        ultimo_ping: imp.ultimo_ping,
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
