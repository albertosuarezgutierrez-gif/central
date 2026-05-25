import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST — check-in personal con QR token
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  const body = await req.json()
  const { accion = 'checkin' } = body

  const { data: asig, error } = await supabase
    .from('personal_evento_asignacion')
    .select('id, checkin_at, checkout_at, hora_entrada, tarifa_hora')
    .eq('checkin_qr_token', token)
    .single()

  if (error || !asig) return NextResponse.json({ error: 'QR no válido' }, { status: 404 })

  const now = new Date().toISOString()
  let updates: Record<string, unknown> = {}

  if (accion === 'checkin' && !asig.checkin_at) {
    updates = { checkin_at: now }
  } else if (accion === 'checkout' && asig.checkin_at && !asig.checkout_at) {
    const horas = (Date.now() - new Date(asig.checkin_at).getTime()) / 3600000
    const importe = Math.round(horas * (asig.tarifa_hora || 0) * 100) / 100
    updates = { checkout_at: now, horas_trabajadas: Math.round(horas * 100) / 100, importe_total: importe }
  } else {
    return NextResponse.json({ error: 'Acción no válida o ya registrada' }, { status: 409 })
  }

  const { data } = await supabase
    .from('personal_evento_asignacion')
    .update(updates)
    .eq('checkin_qr_token', token)
    .select()
    .single()

  return NextResponse.json({ ok: true, registro: data })
}
