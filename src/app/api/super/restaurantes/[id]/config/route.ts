export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return null
  try { return JSON.parse(header) } catch { return null }
}

// GET /api/super/restaurantes/[id]/config
// Devuelve configuración completa del restaurante + stats para el panel super admin
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Datos del restaurante
  const { data: restaurante, error } = await supabase
    .from('restaurantes')
    .select('id, nombre, nombre_comercial, slug, codigo_acceso, access_token, plan, plan_status, activo, ciudad, nif, razon_social, created_at')
    .eq('id', id)
    .single()

  if (error || !restaurante) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  }

  // Stats: camareros, mesas, comandas hoy, ingresos mes, facturas
  const [
    { count: numCamareros },
    { count: numMesas },
    { count: numComandasHoy },
    { count: numFacturas },
  ] = await Promise.all([
    supabase.from('personal').select('*', { count: 'exact', head: true }).eq('local_id', id).eq('activo', true),
    supabase.from('mesas').select('*', { count: 'exact', head: true }).eq('local_id', id),
    supabase.from('comandas').select('*', { count: 'exact', head: true })
      .eq('local_id', id)
      .gte('created_at', new Date().toISOString().slice(0, 10)),
    supabase.from('facturas_verifactu').select('*', { count: 'exact', head: true }).eq('local_id', id),
  ])

  // Última comanda
  const { data: ultimaComanda } = await supabase
    .from('comandas')
    .select('created_at')
    .eq('local_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Ingresos del mes actual
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const { data: pagos } = await supabase
    .from('pagos')
    .select('importe')
    .eq('local_id', id)
    .eq('estado', 'completado')
    .gte('created_at', inicioMes.toISOString())

  const ingresosMes = (pagos || []).reduce((s, p) => s + (p.importe || 0), 0)

  return NextResponse.json({
    restaurante,
    stats: {
      camareros: numCamareros || 0,
      mesas: numMesas || 0,
      comandas_hoy: numComandasHoy || 0,
      ingresos_mes: ingresosMes,
      facturas: numFacturas || 0,
      ultima_comanda: ultimaComanda?.created_at || null,
    }
  })
}

// PUT /api/super/restaurantes/[id]/config
// Actualiza configuración del restaurante (NIF, razón social, plan, activo, nombre_comercial)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const { nif, razon_social, nombre_comercial, plan, activo } = body

  const update: Record<string, unknown> = {}
  if (nif !== undefined) update.nif = nif.trim()
  if (razon_social !== undefined) update.razon_social = razon_social.trim()
  if (nombre_comercial !== undefined) update.nombre_comercial = nombre_comercial.trim()
  if (plan !== undefined) update.plan = plan
  if (activo !== undefined) update.activo = activo

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { error } = await supabase
    .from('restaurantes')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log en security_log
  await supabase.from('security_log').insert({
    evento: 'super_config_update',
    restaurante_id: id,
    detalles: { updated_fields: Object.keys(update), by: session.nombre || 'super_admin' },
  }).then(() => {})

  return NextResponse.json({ ok: true })
}
