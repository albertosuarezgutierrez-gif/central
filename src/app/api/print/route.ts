export const dynamic = 'force-dynamic'

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
import { notifyError } from '@/lib/notify'

const supabase = () => createServerClient()

// Tipos de conexión que el bridge maneja via TCP
const TIPOS_TCP = ['ip_local', 'usb_bridge', 'tcp']

// ── GET — Bridge solicita jobs pendientes ────────────────────
export async function GET(req: NextRequest) {
  const token   = req.nextUrl.searchParams.get('token')
  const version = req.nextUrl.searchParams.get('v') ?? null
  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const sb = supabase()

  // Verificar token de bridge
  const { data: bridge } = await sb
    .from('bridge_tokens')
    .select('id, activo, restaurante_id, scan_requested, rol, en_wifi')
    .eq('token', token)
    .single()

  if (!bridge?.activo) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // ── Mesh: solo el master procesa jobs ────────────────────────
  // Con 1 solo bridge (caso habitual) → siempre procesa. Backward compatible.
  // Con varios bridges → solo el master hace fetch de jobs. Evita duplicados.
  const MASTER_TIMEOUT_MS = 60_000
  const meshDeadline = new Date(Date.now() - MASTER_TIMEOUT_MS).toISOString()
  const { count: nodosActivos } = await sb
    .from('bridge_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', bridge.restaurante_id)
    .eq('activo', true)
    .gt('ultimo_ping', meshDeadline)

  const hayMesh = (nodosActivos ?? 1) > 1
  if (hayMesh && bridge.rol !== 'master') {
    return NextResponse.json({ jobs: [], standby: true, scan_requested: false })
  }

  // Actualizar último ping del bridge (y versión si viene)
  await sb.from('bridge_tokens')
    .update({
      ultimo_ping:    new Date().toISOString(),
      ...(version ? { bridge_version: version } : {}),
    })
    .eq('id', bridge.id)

  // Si hay escaneo solicitado, informar al bridge y limpiar flag
  const scanRequested = bridge.scan_requested === true
  if (scanRequested) {
    await sb.from('bridge_tokens')
      .update({ scan_requested: false })
      .eq('id', bridge.id)
  }

  // Buscar impresoras TCP activas filtradas por restaurante del bridge
  const { data: impresoras } = await sb
    .from('impresoras')
    .select('id, ip_address, port, connection_type')
    .eq('local_id', bridge.restaurante_id)
    .in('connection_type', TIPOS_TCP)
    .eq('activa', true)

  if (!impresoras?.length) {
    return NextResponse.json({ jobs: [], scan_requested: scanRequested })
  }

  const impresoraIds = impresoras.map(i => i.id)
  const impresoraInfo: Record<string, { ip: string; port: number }> = {}
  for (const i of impresoras) {
    impresoraInfo[i.id] = { ip: i.ip_address ?? '', port: i.port ?? 9100 }
  }

  // Obtener jobs pendientes + recuperar encolados con attempts=0 > 90s (TCP failure silenciosa)
  // BUG FIX: usar created_at (inmutable) en lugar de sent_at (se resetea en cada intento fallido)
  // Antes: sent_at < 3min → el contador se reiniciaba en cada fallo → delay acumulable de 3-4min
  // Ahora: created_at < 90s  → el job se recupera siempre en el siguiente poll tras 90s de vida
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString()
  const { data: pendientes } = await sb
    .from('print_jobs')
    .select('id, impresora_id, print_data, payload, attempts')
    .in('impresora_id', impresoraIds)
    .in('status', ['pendiente'])
    .order('created_at', { ascending: true })
    .limit(20)
  const { data: staleEncolados } = await sb
    .from('print_jobs')
    .select('id, impresora_id, print_data, payload, attempts')
    .in('impresora_id', impresoraIds)
    .eq('status', 'encolado')
    .eq('attempts', 0)
    .lt('created_at', ninetySecondsAgo)
    .order('created_at', { ascending: true })
    .limit(10)
  // Priorizar jobs de tipo 'cambio' (anulación/modificación) — cocina debe verlos antes
  const allJobs = [...(pendientes ?? []), ...(staleEncolados ?? [])]
  const jobs = [...allJobs].sort((a, b) => {
    const aCambio = a.payload?.tipo === 'cambio' ? 0 : 1
    const bCambio = b.payload?.tipo === 'cambio' ? 0 : 1
    return aCambio - bCambio
  })

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

  return NextResponse.json({ jobs: result, scan_requested: scanRequested })
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
    const printData = esTcp
      ? (rawData as Buffer).toString('base64')
      : Buffer.from(rawData as string, 'utf8').toString('base64')

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
    .select('attempts, comanda_id, seccion_id, payload, restaurante_id')
    .eq('id', job_id)
    .single()

  const newAttempts = (current?.attempts ?? 0) + 1

  await sb.from('print_jobs')
    .update({
      status,
      attempts:  newAttempts,
      acked_at:  status === 'impreso' ? new Date().toISOString() : undefined,
      error_msg: status === 'error'   ? (error_msg ?? 'Error desconocido') : undefined,
    })
    .eq('id', job_id)

  // Alerta si el job falla 3+ veces
  if (status === 'error' && newAttempts >= 3) {
    const { data: job } = await sb
      .from('print_jobs')
      .select('restaurante_id, comanda_id')
      .eq('id', job_id)
      .single()

    notifyError({
      tipo: 'print_job_fallido',
      modulo: 'bridge',
      mensaje: `Impresión fallida ${newAttempts} veces consecutivas`,
      detalle: { job_id, comanda_id: current?.comanda_id, error: error_msg, intentos: newAttempts },
      restaurante_id: job?.restaurante_id ?? null,
      nivel: newAttempts >= 5 ? 'critico' : 'aviso',
    })
  }

  // Si impreso: actualizar comanda_items
  // ── FIX: no filtrar por seccion_id (es null en los items cuando vienen del LLM sin sección)
  // ── FIX: no actualizar items de jobs tipo 'cambio' (anulación/modificación → no tocan print_status)
  if (status === 'impreso' && current?.comanda_id) {
    const tipo = (current.payload as Record<string, unknown>)?.tipo as string || 'comanda'

    if (tipo !== 'cambio') {
      // Usar los nombres de items del payload para precisión en setups multi-impresora
      const itemsEnJob = ((current.payload as Record<string, unknown>)?.items as Array<{ nombre: string }> ?? [])
        .map(i => i.nombre)

      let query = sb.from('comanda_items')
        .update({ print_status: 'impreso', printed_at: new Date().toISOString() })
        .eq('comanda_id', current.comanda_id)
        .eq('print_status', 'pendiente')
        .is('eliminado_at', null)

      // No marcar items ya cancelados explícitamente
      query = query.not('estado_item', 'eq', 'cancelado')

      // Si tenemos la lista de items del job, filtrar por nombre (evita sobre-marcar en multi-impresora)
      if (itemsEnJob.length > 0) {
        query = query.in('nombre', itemsEnJob)
      }

      await query
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Ticket de prueba ESC/POS mejorado (80mm, autocutter full) ──
function generarEscPosPrueba(nombre: string, ip: string, port: number): Buffer {
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A
  const t = (s: string) => Buffer.from(s, 'latin1')
  const b = (...bytes: number[]) => Buffer.from(bytes)

  const init     = b(ESC, 0x40)
  const center   = b(ESC, 0x61, 0x01)
  const left     = b(ESC, 0x61, 0x00)
  const bold_on  = b(ESC, 0x45, 0x01)
  const bold_off = b(ESC, 0x45, 0x00)
  const big      = b(GS,  0x21, 0x11)
  const medium   = b(GS,  0x21, 0x10)
  const normal   = b(GS,  0x21, 0x00)
  const cut_full = b(GS,  0x56, 0x01)
  const lf       = b(LF)

  const SEP  = '-'.repeat(42)
  const SEP2 = '-'.repeat(42)
  const ahora = new Date()
  const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const bufs: Buffer[] = []

  bufs.push(init)

  // Cabecera marca
  bufs.push(center, lf, big, bold_on, t('ia.rest'), lf, normal, bold_off)
  bufs.push(t('Sistema TPV por voz'), lf, lf)
  bufs.push(left, t(SEP2), lf)

  // Estado OK
  bufs.push(center, medium, bold_on, t('IMPRESORA OK'), lf, normal, bold_off, lf)

  // Detalles
  bufs.push(left, t(SEP), lf)
  bufs.push(bold_on, t('Nombre:   '), bold_off, t(nombre), lf)
  bufs.push(bold_on, t('IP:       '), bold_off, t(ip + ':' + String(port)), lf)
  bufs.push(bold_on, t('Protocolo:'), bold_off, t(' ESC/POS TCP'), lf)
  bufs.push(bold_on, t('Hora:     '), bold_off, t(hora), lf)
  bufs.push(bold_on, t('Fecha:    '), bold_off, t(fecha), lf)
  bufs.push(t(SEP), lf, lf)

  // Nota al pie
  bufs.push(center)
  bufs.push(t('Si ves esto, todo funciona.'), lf)
  bufs.push(t('Listo para marchar.'), lf, lf, lf, lf)
  bufs.push(cut_full)

  return Buffer.concat(bufs)
}
