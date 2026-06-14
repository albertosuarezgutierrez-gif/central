// Puerto del OPERADOR (god-panel de la matriz). Consolidado de descuadres de caja
// POR EMPLEADO y POR LOCAL, para el cuadro de mando de apps/plataforma. Read-only,
// server-to-server con `Authorization: Bearer <OPERADOR_SHARED_SECRET>`. Lee
// arqueos_caja_empleado de la BD viva de ia-rest. Additivo, no toca nada más.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { resumirDescuadresEmpleado, type FilaArqueoEmpleado } from '@central/module-contabilidad'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// GET /api/operador/descuadres-empleado?desde&hasta[&local_id]
// → { negocios: [{ local_id, descuadre_total, peor_descuadre, resumen: ResumenDescuadreEmpleado[] }] }
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const hoy = new Date()
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const desde = searchParams.get('desde') ?? primeroMes
  const hasta = searchParams.get('hasta') ?? hoy.toISOString().split('T')[0]
  const localId = searchParams.get('local_id')

  const supabase = createServerClient()
  let q = supabase
    .from('arqueos_caja_empleado')
    .select('local_id, camarero_id, camarero_nombre, fecha, diferencia_caja, conteo_realizado')
    .gte('fecha', desde).lte('fecha', hasta)
  if (localId) q = q.eq('local_id', localId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupar por local y resumir por empleado dentro de cada uno.
  const porLocal = new Map<string, FilaArqueoEmpleado[]>()
  for (const row of (data ?? []) as ({ local_id: string } & FilaArqueoEmpleado)[]) {
    const arr = porLocal.get(row.local_id) ?? []
    arr.push(row)
    porLocal.set(row.local_id, arr)
  }

  const negocios = Array.from(porLocal.entries()).map(([local_id, filas]) => {
    const resumen = resumirDescuadresEmpleado(filas)
    const descuadre_total = Math.round(resumen.reduce((s, r) => s + r.descuadre_total, 0) * 100) / 100
    const peor_descuadre = resumen.reduce((p, r) => (Math.abs(r.peor_descuadre) > Math.abs(p) ? r.peor_descuadre : p), 0)
    return { local_id, descuadre_total, peor_descuadre, resumen }
  })

  return NextResponse.json({ ok: true, desde, hasta, negocios })
}
