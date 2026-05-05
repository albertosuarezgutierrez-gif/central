// GET /api/caja  → resumen del turno activo
// POST /api/caja → añadir movimiento manual (retiro/gasto/ingreso/apertura)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  // Turno activo
  const { data: turno } = await supabase
    .from('turnos').select('id, nombre, created_at')
    .eq('restaurante_id', rid).eq('estado', 'activo').single()

  if (!turno) return NextResponse.json({ turno: null, movimientos: [], resumen: null })

  // Movimientos del turno
  const { data: movs } = await supabase
    .from('movimientos_caja')
    .select('id, tipo, concepto, importe, saldo_acumulado, camarero_nombre, mesa_label, notas, created_at')
    .eq('restaurante_id', rid).eq('turno_id', turno.id)
    .order('created_at', { ascending: false })

  const lista = movs ?? []

  // Resumen
  const saldo_actual = lista[0]?.saldo_acumulado ?? 0
  const cobros_efectivo = lista.filter(m => m.tipo === 'cobro_efectivo').reduce((s, m) => s + m.importe, 0)
  const cambios         = lista.filter(m => m.tipo === 'cambio').reduce((s, m) => s + Math.abs(m.importe), 0)
  const retiros         = lista.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Math.abs(m.importe), 0)
  const gastos          = lista.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Math.abs(m.importe), 0)
  const apertura        = lista.find(m => m.tipo === 'apertura')?.importe ?? 0

  return NextResponse.json({
    turno,
    movimientos: lista,
    resumen: { saldo_actual, cobros_efectivo, cambios, retiros, gastos, apertura }
  })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { tipo, concepto, importe, notas } = await req.json() as {
    tipo: string; concepto: string; importe: number; notas?: string
  }

  if (!tipo || !concepto || importe === undefined)
    return NextResponse.json({ error: 'tipo, concepto e importe requeridos' }, { status: 400 })

  const { data: turno } = await supabase
    .from('turnos').select('id').eq('restaurante_id', rid).eq('estado', 'activo').single()
  if (!turno) return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })

  // Saldo actual
  const { data: ultimo } = await supabase
    .from('movimientos_caja').select('saldo_acumulado')
    .eq('restaurante_id', rid).eq('turno_id', turno.id)
    .order('created_at', { ascending: false }).limit(1).single()

  const saldo_ant = ultimo?.saldo_acumulado ?? 0
  // Salidas: retiro, gasto, cambio → importe negativo
  const delta = ['retiro','gasto','cambio'].includes(tipo) ? -Math.abs(importe) : Math.abs(importe)
  const saldo_nuevo = saldo_ant + delta

  const { data: mov } = await supabase.from('movimientos_caja').insert({
    restaurante_id: rid, turno_id: turno.id,
    tipo, concepto, importe: delta, saldo_acumulado: saldo_nuevo,
    camarero_id: session.id, camarero_nombre: session.nombre,
    notas: notas ?? null,
  }).select().single()

  return NextResponse.json({ ok: true, movimiento: mov, saldo: saldo_nuevo }, { status: 201 })
}
