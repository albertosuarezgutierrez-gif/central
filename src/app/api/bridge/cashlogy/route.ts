export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * POST /api/bridge/cashlogy
 * Body: { action: 'discover' | 'charge' | 'status' | 'close', ...params }
 *
 * ia.rest actúa como relay: recibe la petición del camarero,
 * encola un bridge_command de tipo cashlogy_* para que bridge-local.js
 * lo ejecute en la LAN del restaurante y devuelva el resultado.
 */

const TIMEOUT_DISCOVERY = 30000  // 30s para escanear la LAN
const TIMEOUT_CHARGE    = 180000 // 3 min para cobro (cliente mete monedas)
const TIMEOUT_STATUS    = 5000

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { action, importe, comanda_id } = await req.json()

  if (!action) return NextResponse.json({ error: 'action requerido' }, { status: 400 })

  // ── Verificar que Cashlogy está configurado (excepto discovery) ──
  if (action !== 'discover') {
    const { data: cfg } = await supabase
      .from('cobro_config')
      .select('cashlogy_activo, cashlogy_ip, cashlogy_port, cashlogy_status')
      .eq('local_id', rid)
      .maybeSingle()

    if (!cfg?.cashlogy_activo)
      return NextResponse.json({ error: 'Cashlogy no activado' }, { status: 400 })
    if (!cfg?.cashlogy_ip && action !== 'discover')
      return NextResponse.json({ error: 'Cashlogy no encontrada. Ejecuta discovery primero.' }, { status: 400 })
  }

  // ── Encolar comando en bridge_commands ──────────────────────────
  const tipo = `cashlogy_${action}` // cashlogy_discover | cashlogy_charge | cashlogy_status | cashlogy_close

  // Para charge: crear operación pendiente primero
  let operacion_id: string | null = null
  if (action === 'charge') {
    if (!importe || importe <= 0)
      return NextResponse.json({ error: 'importe requerido en céntimos' }, { status: 400 })

    const opNum = `${Date.now()}`.slice(-8) // 8 dígitos únicos

    const { data: op } = await supabase
      .from('cashlogy_operaciones')
      .insert({
        local_id:     rid,
        comanda_id:         comanda_id ?? null,
        op_num:             opNum,
        importe_solicitado: importe,
        estado:             'pendiente',
        iniciado_por:       session.id ?? null,
      })
      .select('id')
      .single()

    operacion_id = op?.id ?? null
  }

  // Insertar en bridge_commands para que bridge-local.js lo ejecute
  const timeout = action === 'charge' ? TIMEOUT_CHARGE
    : action === 'discover' ? TIMEOUT_DISCOVERY
    : TIMEOUT_STATUS

  const { data: cmd, error: cmdErr } = await supabase
    .from('bridge_commands')
    .insert({
      local_id: rid,
      impresora_id:   null, // no aplica para Cashlogy
      payload: {
        tipo,
        importe:      importe ?? null,
        op_num:       operacion_id ? `${Date.now()}`.slice(-8) : null,
        operacion_id: operacion_id,
      },
      status: 'pending',
    })
    .select('id')
    .single()

  if (cmdErr)
    return NextResponse.json({ error: cmdErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    command_id:   cmd.id,
    operacion_id,
    timeout_ms:   timeout,
    message:      action === 'discover'
      ? 'Buscando Cashlogy en la red local...'
      : action === 'charge'
        ? 'Esperando cobro en la Cashlogy...'
        : 'Consultando estado...',
  })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const url    = new URL(req.url)
  const cmdId  = url.searchParams.get('command_id')
  const opId   = url.searchParams.get('operacion_id')

  // Estado de un comando bridge
  if (cmdId) {
    const { data } = await supabase
      .from('bridge_commands')
      .select('id, status, payload, executed_at, created_at')
      .eq('id', cmdId)
      .single()
    return NextResponse.json({ command: data })
  }

  // Estado de una operación Cashlogy
  if (opId) {
    const { data } = await supabase
      .from('cashlogy_operaciones')
      .select('*')
      .eq('id', opId)
      .eq('local_id', rid)
      .single()
    return NextResponse.json({ operacion: data })
  }

  // Config + stats
  const [{ data: cfg }, { data: stats }] = await Promise.all([
    supabase.from('cobro_config')
      .select('cashlogy_activo, cashlogy_ip, cashlogy_port, cashlogy_status, cashlogy_version, cashlogy_descubierta_at')
      .eq('local_id', rid)
      .maybeSingle(),
    supabase.from('v_cashlogy_stats')
      .select('*')
      .eq('restaurante_id', rid)
      .maybeSingle(),
  ])

  return NextResponse.json({ config: cfg, stats })
}
