// ============================================================
// ia.rest · /api/print
// ============================================================
// Bridge endpoint para impresoras ESC/POS TCP.
// La impresora NO hace polling — lo hace el bridge local
// (scripts/bridge-local.js) en la red del restaurante.
//
// GET  ?token=BRIDGE_TOKEN
//   → devuelve print_jobs pendientes con print_data (ESC/POS)
//   → el bridge los manda via TCP a IP:9100
//
// POST { job_id, status: 'impreso'|'error', error_msg? }
//   → el bridge confirma entrega
//
// POST { trigger: 'test', impresora_id }
//   → crea un job de prueba para verificar conectividad
//
// connection_type validos para bridge TCP (ip_local, usb_bridge): 'tcp' | 'ip_local' | 'usb_bridge'
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generarTextoPlano } from '@/lib/courier'

const supabase = () => createServerClient()

// Tipos de conexión que el bridge maneja via TCP
const TIPOS_TCP = ['ip_local', 'usb_bridge']

// ── GET — Bridge solicita jobs pendientes ────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const sb = supabase()

  // Verificar token de bridge
  const { data: bridge } = await sb
    .from('bridge_tokens')
    .select('id, activo, restaurante_id')
    .eq('token', token)
    .single()

  if (!bridge?.activo) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // Actualizar último ping del bridge
  await sb.from('bridge_tokens')
    .update({ ultimo_ping: new Date().toISOString() })
    .eq('id', bridge.id)

  // Buscar impresoras TCP activas filtradas por restaurante del bridge
  const { data: impresoras } = await sb
    .from('impresoras')
    .select('id, ip_address, port, connection_type')
    .eq('restaurante_id', bridge.restaurante_id)
    .in('connection_type', TIPOS_TCP)
    .eq('activa', true)

  if (!impresoras?.length) {
    return NextResponse.json({ jobs: [] })
  }

  const impresoraIds = impresoras.map(i => i.id)
  const impresoraInfo: Record<string, { ip: string; port: number }> = {}
  for (const i of impresoras) {
    impresoraInfo[i.id] = { ip: i.ip_address ?? '', port: i.port ?? 9100 }
  }

  // Obtener jobs pendientes (máx. 20 por polling)
  const { data: jobs } = await sb
    .from('print_jobs')
    .select('id, impresora_id, print_data, payload, attempts')
    .in('impresora_id', impresoraIds)
    .in('status', ['pendiente'])
    .order('created_at', { ascending: true })
    .limit(20)

  if (!jobs?.length) {
    return NextResponse.json({ jobs: [] })
  }

  // Marcar como "encolado" para no servir duplicados
  const jobIds = jobs.map(j => j.id)
  await sb.from('print_jobs')
    .update({ status: 'encolado', sent_at: new Date().toISOString() })
    .in('id', jobIds)

  const result = jobs.map(j => ({
    id:         j.id,
    ip:         impresoraInfo[j.impresora_id]?.ip ?? '',
    port:       impresoraInfo[j.impresora_id]?.port ?? 9100,
    print_data: j.print_data,
    attempts:   j.attempts,
  }))

  return NextResponse.json({ jobs: result })
}

// ── POST — Bridge confirma / Owner dispara test ──────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sb = supabase()

  // ─ Test de impresión (disparado desde /owner) ─────────────
  if (body.trigger === 'test' && body.impresora_id) {
    const { data: imp } = await sb
      .from('impresoras')
      .select('id, nombre, seccion_id, restaurante_id, ip_address, port, connection_type')
      .eq('id', body.impresora_id)
      .single()

    if (!imp) {
      return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })
    }

    const ahora    = new Date()
    const horaStr  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const fechaStr = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

    const payload = {
      mesa:       'TEST',
      camarero:   'ia.rest',
      ticket_num: 0,
      seccion:    imp.nombre ?? 'TEST',
      items: [
        { nombre: 'IMPRESORA CONECTADA', cantidad: 1 },
        { nombre: `IP: ${imp.ip_address ?? 'N/A'}:${imp.port ?? 9100}`, cantidad: 1 },
        { nombre: `Modelo: ${imp.nombre}`, cantidad: 1 },
        { nombre: `Hora: ${horaStr}`, cantidad: 1 },
        { nombre: fechaStr, cantidad: 1 },
      ],
      tipo: 'test',
      ts:   ahora.toISOString(),
    }

    const esTcp = TIPOS_TCP.includes(imp.connection_type)
    const rawData = esTcp
      ? generarEscPosPrueba(imp.nombre ?? 'Impresora', imp.ip_address ?? '', imp.port ?? 9100)
      : generarTextoPlano(payload)
    const printData = Buffer.from(rawData, 'binary').toString('base64')

    const { data: job, error } = await sb
      .from('print_jobs')
      .insert({
        impresora_id:  imp.id,
        seccion_id:    imp.seccion_id,
        restaurante_id: imp.restaurante_id,
        payload,
        print_data:    printData,
        status:        'pendiente',
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, job_id: job.id })
  }

  // ─ Confirmación de entrega desde bridge ──────────────────
  const { job_id, status, error_msg } = body

  if (!job_id || !['impreso', 'error'].includes(status)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { data: current } = await sb
    .from('print_jobs')
    .select('attempts, comanda_id, seccion_id')
    .eq('id', job_id)
    .single()

  await sb.from('print_jobs')
    .update({
      status,
      attempts:  (current?.attempts ?? 0) + 1,
      acked_at:  status === 'impreso' ? new Date().toISOString() : undefined,
      error_msg: status === 'error'   ? (error_msg ?? 'Error desconocido') : undefined,
    })
    .eq('id', job_id)

  // Si impreso: actualizar comanda_items
  if (status === 'impreso' && current?.comanda_id) {
    await sb.from('comanda_items')
      .update({
        print_status: 'impreso',
        printed_at:   new Date().toISOString(),
      })
      .eq('comanda_id', current.comanda_id)
      .eq('seccion_id', current.seccion_id)
  }

  return NextResponse.json({ ok: true })
}

// ── Ticket de prueba ESC/POS mejorado (80mm, autocutter full) ──
function generarEscPosPrueba(nombre: string, ip: string, port: number): string {
  const ESC = '\x1B'
  const GS  = '\x1D'
  const LF  = '\x0A'

  const init     = ESC + '@'
  const center   = ESC + 'a\x01'
  const left     = ESC + 'a\x00'
  const bold_on  = ESC + 'E\x01'
  const bold_off = ESC + 'E\x00'
  const big      = GS  + '!\x11'   // 2x ancho + 2x alto
  const medium   = GS  + '!\x10'   // 2x ancho
  const normal   = GS  + '!\x00'
  const cut_full = GS  + 'V\x00'   // Autocorte completo

  const SEP  = '-'.repeat(42)
  const SEP2 = '-'.repeat(42)
  const ahora = new Date()
  const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const lines: string[] = []

  lines.push(init)

  // Cabecera marca
  lines.push(center)
  lines.push(LF)
  lines.push(big + bold_on)
  lines.push('ia.rest' + LF)
  lines.push(normal + bold_off)
  lines.push('Sistema TPV por voz' + LF)
  lines.push(LF)

  lines.push(left)
  lines.push(SEP2 + LF)

  // Estado OK en grande centrado
  lines.push(center)
  lines.push(medium + bold_on)
  lines.push('IMPRESORA OK' + LF)
  lines.push(normal + bold_off)
  lines.push(LF)

  // Detalles
  lines.push(left)
  lines.push(SEP + LF)
  lines.push(bold_on + 'Nombre:   ' + bold_off + nombre + LF)
  lines.push(bold_on + 'IP:       ' + bold_off + ip + ':' + String(port) + LF)
  lines.push(bold_on + 'Protocolo:' + bold_off + ' ESC/POS TCP' + LF)
  lines.push(bold_on + 'Hora:     ' + bold_off + hora + LF)
  lines.push(bold_on + 'Fecha:    ' + bold_off + fecha + LF)
  lines.push(SEP + LF)
  lines.push(LF)

  // Nota al pie
  lines.push(center)
  lines.push('Si ves esto, todo funciona.' + LF)
  lines.push('Listo para marchar.' + LF)
  lines.push(LF)
  lines.push(LF)
  lines.push(LF)

  // Corte completo (Seiko + Sunmi soportan GS V 0)
  lines.push(cut_full)

  return lines.join('')
}
