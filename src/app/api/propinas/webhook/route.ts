export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ia.rest · POST /api/propinas/webhook
// Webhook Stripe — confirma pago de propina y hace reparto entre personal del turno

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Stripe from 'stripe'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })
  const sig    = req.headers.get('stripe-signature') ?? ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET_PROPINAS ?? ''

  let event: Stripe.Event
  try {
    const body = await req.text()
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    console.error('[propinas-webhook] Firma inválida:', err)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ ok: true, ignorado: event.type })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const { propina_id, token, importe, restaurante_id } = session.metadata ?? {}

  if (!propina_id || !token) return NextResponse.json({ ok: true })

  const supabase = createServerClient()
  const importeNum = parseFloat(importe ?? '0')

  // 1. Obtener propina con turno activo
  const { data: propina } = await supabase
    .from('propinas')
    .select('id, estado, turno_id, comanda_id, restaurantes(nombre, propinas_reparto_modo)')
    .eq('id', propina_id)
    .maybeSingle()

  if (!propina || propina.estado === 'pagada') return NextResponse.json({ ok: true })

  const rest = propina.restaurantes as unknown as { nombre: string; propinas_reparto_modo: string } | null
  const modoReparto = rest?.propinas_reparto_modo ?? 'equitativo'

  // 2. Calcular reparto
  let reparto: { camarero_id: string; nombre: string; porcentaje: number; importe: number }[] = []

  if (modoReparto === 'mesa' && propina.comanda_id) {
    // Solo el camarero de la mesa
    const { data: comanda } = await supabase
      .from('comandas')
      .select('camarero_id, personal(nombre)')
      .eq('id', propina.comanda_id)
      .maybeSingle()
    if (comanda?.camarero_id) {
      const nombre = (comanda.personal as unknown as { nombre: string } | null)?.nombre ?? '—'
      reparto = [{ camarero_id: comanda.camarero_id, nombre, porcentaje: 100, importe: importeNum }]
    }
  } else {
    // Equitativo: todos los camareros con fichaje activo en el turno de servicio
    const { data: turnos } = await supabase
      .from('turnos')
      .select('camarero_id, personal(nombre)')
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'activo')
      .not('camarero_id', 'is', null)
    const personal = (turnos ?? []).filter(t => t.camarero_id)
    const n = personal.length || 1
    const pct = Math.round(100 / n)
    const importePorPersona = Math.round((importeNum / n) * 100) / 100
    reparto = personal.map((t, i) => ({
      camarero_id: t.camarero_id!,
      nombre: (t.personal as unknown as { nombre: string } | null)?.nombre ?? '—',
      porcentaje: i === personal.length - 1 ? 100 - pct * (n - 1) : pct,
      importe: importePorPersona,
    }))
  }

  // 3. Marcar propina como pagada
  await supabase.from('propinas').update({
    estado:    'pagada',
    importe:   importeNum,
    pagada_at: new Date().toISOString(),
    reparto,
    stripe_payment_intent: session.payment_intent as string ?? null,
  }).eq('id', propina_id)

  // 4. Notificar
  const repartoTexto = reparto.map(r => `${r.nombre}: ${r.importe.toFixed(2)}€`).join(' · ')
  await tgAlert(
    `💰 Propina <b>${importeNum.toFixed(2)}€</b> en ${rest?.nombre ?? 'restaurante'}\n${repartoTexto}`,
    'info'
  )

  return NextResponse.json({ ok: true })
}
