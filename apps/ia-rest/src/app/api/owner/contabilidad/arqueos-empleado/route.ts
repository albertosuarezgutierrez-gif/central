export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { resumirDescuadresEmpleado, type FilaArqueoEmpleado } from '@central/module-contabilidad'

/**
 * GET /api/owner/contabilidad/arqueos-empleado?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Histórico de descuadres POR EMPLEADO en un rango (por defecto, mes en curso).
 * Devuelve el resumen agregado (totales/media/peor/patrón) + el detalle por fecha.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const hoy = new Date()
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const desde = searchParams.get('desde') ?? primeroMes.toISOString().split('T')[0]
  const hasta = searchParams.get('hasta') ?? hoy.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('arqueos_caja_empleado')
    .select('camarero_id, camarero_nombre, fecha, diferencia_caja, conteo_realizado, fondo_final, saldo_teorico, notas, confirmado_at')
    .eq('local_id', rid)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as FilaArqueoEmpleado[]
  const resumen = resumirDescuadresEmpleado(filas)

  return NextResponse.json({ ok: true, desde, hasta, resumen, detalle: data ?? [] })
}
