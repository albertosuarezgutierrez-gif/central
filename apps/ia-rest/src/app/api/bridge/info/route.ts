export const dynamic = 'force-dynamic'

// src/app/api/bridge/info/route.ts
// Heartbeat del bridge — actualiza último ping y gestiona master election mesh

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

// Un master se considera caído si no hace ping en más de este tiempo
const MASTER_TIMEOUT_MS = 60_000

export async function GET(req: NextRequest) {
  const token   = req.nextUrl.searchParams.get('token')
  const version = req.nextUrl.searchParams.get('v')
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

  const sb = createServerClient()

  // ── Verificar token ──────────────────────────────────────────
  const { data: bt } = await sb
    .from('bridge_tokens')
    .select('id, local_id, activo, rol, en_wifi, bridge_version')
    .eq('token', token)
    .single()

  if (!bt) return NextResponse.json({ error: 'token inválido' }, { status: 401 })
  if (!bt.activo) return NextResponse.json({ error: 'bridge desactivado' }, { status: 403 })

  // ── Leer parámetros opcionales del dispositivo ───────────────
  const enWifi     = req.nextUrl.searchParams.get('wifi') !== '0'   // '0' = datos móviles
  const ipLan      = req.nextUrl.searchParams.get('ip_lan') ?? null
  const platform   = req.nextUrl.searchParams.get('platform') ?? null
  const deviceName = req.nextUrl.searchParams.get('device') ?? null

  const ahora = new Date()

  // ── Master election — lógica atómica ────────────────────────
  // Si este bridge está en WiFi → puede ser master
  // Si está en datos móviles → siempre standby (no alcanza impresoras LAN)
  let nuevoRol: 'master' | 'standby' = 'standby'

  if (enWifi) {
    // ¿Hay algún master activo (con ping reciente) que no sea yo?
    const deadline = new Date(ahora.getTime() - MASTER_TIMEOUT_MS).toISOString()
    const { data: masterActivo } = await sb
      .from('bridge_tokens')
      .select('id')
      .eq('local_id', bt.local_id)
      .eq('activo', true)
      .eq('rol', 'master')
      .eq('en_wifi', true)
      .gt('ultimo_ping', deadline)
      .neq('id', bt.id)
      .maybeSingle()

    if (!masterActivo) {
      // No hay master activo → me promuevo
      nuevoRol = 'master'
    } else {
      // Hay master activo → sigo como standby
      nuevoRol = 'standby'
    }
  }

  // ── Actualizar registro del bridge ───────────────────────────
  const updatePayload: Record<string, unknown> = {
    ultimo_ping:   ahora.toISOString(),
    en_wifi:       enWifi,
    rol:           nuevoRol,
    ...(version    ? { bridge_version: version } : {}),
    ...(ipLan      ? { ip_lan: ipLan }           : {}),
    ...(platform   ? { platform }                : {}),
    ...(deviceName ? { device_name: deviceName } : {}),
    ...(nuevoRol === 'master' && bt.rol !== 'master'
      ? { promovido_at: ahora.toISOString() }
      : {}),
  }
  await sb.from('bridge_tokens').update(updatePayload).eq('id', bt.id)

  // ── Impresoras activas del restaurante ───────────────────────
  const { data: impresoras } = await sb
    .from('impresoras')
    .select('id, nombre, ip_address, port, mac_address, activa')
    .eq('local_id', bt.local_id)
    .eq('activa', true)

  // ── Cuántos nodos activos hay en total (para info del bridge) ─
  const deadline15 = new Date(ahora.getTime() - MASTER_TIMEOUT_MS).toISOString()
  const { count: nodosActivos } = await sb
    .from('bridge_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', bt.local_id)
    .eq('activo', true)
    .gt('ultimo_ping', deadline15)

  return NextResponse.json({
    ok:              true,
    local_id:  bt.local_id,
    rol:             nuevoRol,         // 'master' | 'standby' — el bridge usa esto
    nodos_activos:   nodosActivos ?? 1,
    impresoras:      impresoras ?? [],
  })
}
