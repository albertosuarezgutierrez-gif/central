export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { resolverComisionConfig, calcularComision } from '@/lib/cobros-comision'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body, sig,
      process.env.STRIPE_WEBHOOK_SECRET_CONNECT!
    )
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalida' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Cuenta Connect activada — Fran completó el onboarding bancario
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    const activo = account.charges_enabled && account.payouts_enabled

    // Actualizar BD
    await supabase
      .from('restaurantes')
      .update({ stripe_connect_onboarded: activo })
      .eq('configuracion->>stripe_connect_id', account.id)

    // Notificar a Alberto si acaba de activarse
    if (activo) {
      // Buscar nombre del restaurante para el mensaje
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('nombre, email_contacto')
        .eq('configuracion->>stripe_connect_id', account.id)
        .single()

      const nombre = rest?.nombre ?? account.id
      await tgAlert(
        `🏦 <b>Onboarding bancario completado</b>\n\n` +
        `<b>${nombre}</b> ha configurado su cuenta bancaria en Stripe.\n` +
        `Ya puede recibir cobros directamente.\n\n` +
        `Stripe ID: <code>${account.id}</code>`,
        'resuelto'
      )
    }
  }

  // Pago completado
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const update: Record<string, unknown> = {
      estado: 'pagado',
      pagado_at: new Date().toISOString(),
      stripe_payment_intent: (session.payment_intent as string) ?? null,
    }
    // Red de seguridad: si el formulario no trajo email/teléfono, los recuperamos
    // de los datos que Stripe capturó en el pago.
    const email = session.customer_details?.email
    const telefono = session.customer_details?.phone || session.metadata?.telefono_pagador
    if (email) update.email_pagador = email
    if (telefono) update.telefono_pagador = telefono

    // Enlace AUTORITATIVO por metadata: el checkout guarda los ids de las filas en
    // `metadata.pago_ids`. Lo usamos como vía principal porque es fiable aunque el
    // `stripe_checkout_session` no se haya llegado a guardar en la fila (p. ej. un
    // pedido multi-menú cuyo UPDATE posterior a crear la sesión no persistió). Sin
    // esto, un pago real se quedaría como 'pendiente' para siempre (dinero cobrado
    // por el catering pero sin reflejar en el portal).
    const pagoIds = (session.metadata?.pago_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    // Idempotencia: Stripe reintenta el webhook. Solo transicionamos las filas que
    // aún no estaban 'pagado' y nos quedamos con las que de verdad acaban de pagarse,
    // para no enviar el aviso de Telegram dos veces.
    let q = supabase.from('cobros_grupo_pagos').update(update).neq('estado', 'pagado')
    q = pagoIds.length
      ? q.or(`stripe_checkout_session.eq.${session.id},id.in.(${pagoIds.join(',')})`)
      : q.eq('stripe_checkout_session', session.id)

    const { data: recienPagados } = await q.select(
      'cobro_grupo_id, concepto, cantidad, importe_eur, nombre_pagador'
    )

    if (recienPagados?.length) {
      await registrarComisionResumen(supabase, recienPagados)
      await avisarCompra(supabase, recienPagados)
    }
  }

  return NextResponse.json({ ok: true })
}

type PagoFila = {
  cobro_grupo_id: string
  concepto: string | null
  cantidad: number | null
  importe_eur: number | null
  nombre_pagador: string | null
}

// Registra el cobro de grupo en resumen_cobros_mensual (volumen + comisión ia.rest) para
// que aparezca en el panel /super → Cobro. La comisión se calcula con la config del
// restaurante (misma fórmula que el checkout). Best-effort: nunca rompe el webhook.
async function registrarComisionResumen(
  supabase: ReturnType<typeof createServerClient>,
  pagados: PagoFila[]
): Promise<void> {
  try {
    // Importe (base) por portal de esta tanda de pagos
    const porCobro = new Map<string, number>()
    for (const p of pagados) {
      porCobro.set(p.cobro_grupo_id, (porCobro.get(p.cobro_grupo_id) ?? 0) + Number(p.importe_eur ?? 0))
    }
    const { data: portales } = await supabase
      .from('cobros_grupo')
      .select('id, local_id')
      .in('id', Array.from(porCobro.keys()))

    for (const portal of (portales ?? []) as { id: string; local_id: string }[]) {
      const importe = porCobro.get(portal.id) ?? 0
      if (importe <= 0) continue
      const { data: cfgRow } = await supabase
        .from('cobro_config')
        .select('comision_pct, comision_fija_eur')
        .eq('local_id', portal.local_id)
        .maybeSingle()
      const { comisionEur } = calcularComision(importe, resolverComisionConfig(cfgRow))
      await supabase.rpc('registrar_pago_cobro', {
        p_restaurante_id: portal.local_id,
        p_importe_eur: importe,
        p_comision_eur: comisionEur,
      })
    }
  } catch (e) {
    console.error('[stripe-connect] registrar comisión en resumen:', e)
  }
}

// Aviso por Telegram al operador cuando se confirma una compra en un portal de cobros
// de grupo con avisar_telegram = true. Best-effort: nunca rompe el 200 del webhook.
async function avisarCompra(
  supabase: ReturnType<typeof createServerClient>,
  pagados: PagoFila[]
): Promise<void> {
  try {
    const cobroId = pagados[0].cobro_grupo_id

    const { data: portal } = await supabase
      .from('cobros_grupo')
      .select('titulo, avisar_telegram')
      .eq('id', cobroId)
      .single()

    if (!portal?.avisar_telegram) return

    const eur = (n: number) =>
      n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

    const totalCompra = pagados.reduce((s, p) => s + Number(p.importe_eur ?? 0), 0)

    // Acumulado del portal (ya incluye esta compra, que acabamos de marcar 'pagado').
    const { data: todos } = await supabase
      .from('cobros_grupo_pagos')
      .select('importe_eur')
      .eq('cobro_grupo_id', cobroId)
      .eq('estado', 'pagado')

    const acumulado = (todos ?? []).reduce((s, p) => s + Number(p.importe_eur ?? 0), 0)

    const nombre = pagados[0].nombre_pagador?.trim() || 'Invitado'
    const lineas = pagados
      .map(p => `• ${p.cantidad ?? 1}× ${p.concepto ?? 'Menú'}`)
      .join('\n')

    await tgAlert(
      `🛒 Nueva compra · ${portal.titulo}\n\n` +
      `👤 ${nombre}\n` +
      `${lineas}\n` +
      `💶 Esta compra: ${eur(totalCompra)}\n` +
      `📊 Recaudado del congreso: ${eur(acumulado)}`,
      'info'
    )
  } catch {
    // Best-effort: un fallo del aviso no debe afectar al procesamiento del pago.
  }
}
