export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Signo de cada tipo sobre el saldo de la CAJA FUERTE.
const SIGNO_CAJA_FUERTE: Record<string, number> = {
  ingreso_caja_fuerte: +1, // del cajón → caja fuerte
  retirada_banco: -1,      // caja fuerte → banco
  entrada_banco: 0,        // movimiento lado banco (no afecta caja fuerte)
  ajuste: +1,              // importe con signo
}

/**
 * GET  /api/owner/contabilidad/tesoreria?desde&hasta  → movimientos + saldo caja fuerte
 * POST /api/owner/contabilidad/tesoreria              → crea un movimiento de tesorería
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const hoy = new Date()
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const desde = searchParams.get('desde') ?? primeroMes
  const hasta = searchParams.get('hasta') ?? hoy.toISOString().split('T')[0]

  // Saldo de caja fuerte: histórico completo (no solo el rango) para que sea real.
  const { data: todos, error: e1 } = await supabase
    .from('movimientos_tesoreria').select('tipo, importe').eq('local_id', rid)
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  const saldo_caja_fuerte = Math.round((todos ?? []).reduce(
    (s, m) => s + (SIGNO_CAJA_FUERTE[m.tipo] ?? 0) * Number(m.importe || 0), 0) * 100) / 100

  const { data, error } = await supabase
    .from('movimientos_tesoreria')
    .select('id, tipo, importe, referencia, fecha, notas, created_at')
    .eq('local_id', rid).gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, desde, hasta, saldo_caja_fuerte, movimientos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  const tipo: string = body.tipo
  const importe = Number(body.importe)
  if (!(tipo in SIGNO_CAJA_FUERTE)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if (!Number.isFinite(importe) || importe === 0) return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('movimientos_tesoreria')
    .insert({
      local_id: rid, tipo, importe,
      referencia: body.referencia?.trim() || null,
      fecha: body.fecha || new Date().toISOString().split('T')[0],
      notas: body.notas?.trim() || null,
      creado_por: session.id,
    })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: data.id })
}
