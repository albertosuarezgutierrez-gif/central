export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = createServerClient()

  const { data: restaurante, error } = await sb
    .from('restaurantes')
    .select('id, nombre, nombre_comercial, slug, codigo_acceso, plan, plan_status, activo, ciudad, nif, razon_social, created_at, trial_end, max_camareros')
    .eq('id', id)
    .single()

  if (error || !restaurante) return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [
    { count: camareros },
    { count: mesas },
    { count: comandasHoy },
    { count: facturas },
    { data: pagos },
    { data: ultimaComanda },
  ] = await Promise.all([
    sb.from('personal').select('*', { count: 'exact', head: true }).eq('local_id', id).eq('activo', true),
    sb.from('mesas').select('*', { count: 'exact', head: true }).eq('local_id', id),
    sb.from('comandas').select('*', { count: 'exact', head: true })
      .eq('local_id', id)
      .gte('created_at', new Date().toISOString().slice(0, 10)),
    sb.from('facturas_verifactu').select('*', { count: 'exact', head: true }).eq('local_id', id),
    sb.from('pagos').select('importe').eq('local_id', id).eq('estado', 'completado').gte('created_at', inicioMes.toISOString()),
    sb.from('comandas').select('created_at').eq('local_id', id).order('created_at', { ascending: false }).limit(1).single(),
  ])

  const ingresosMes = (pagos || []).reduce((s: number, p: any) => s + (p.importe || 0), 0)

  return NextResponse.json({
    restaurante,
    stats: {
      camareros:      camareros ?? 0,
      mesas:          mesas ?? 0,
      comandas_hoy:   comandasHoy ?? 0,
      ingresos_mes:   ingresosMes,
      facturas:       facturas ?? 0,
      ultima_comanda: (ultimaComanda as any)?.created_at ?? null,
    },
  })
}
