import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'

// ─── Selector test / live ────────────────────────────────────────────────────
// Para activar modo LIVE cuando salgas a mercado:
//   Supabase → Edge Functions → Secrets → STRIPE_MODE = live
// ─────────────────────────────────────────────────────────────────────────────
function getWebhookSecret(): string {
  const mode = (Deno.env.get("STRIPE_MODE") ?? "test").toLowerCase();
  if (mode === "test") {
    return Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ?? "";
  }
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const bodyText = await req.text()
  const signature = req.headers.get('Stripe-Signature') ?? ''
  const webhookSecret = getWebhookSecret();

  if (webhookSecret && !verificarFirmaStripe(bodyText, signature, webhookSecret)) {
    console.warn('[webhook-stripe] Firma inválida')
    return new Response('Unauthorized', { status: 401 })
  }

  let event: any
  try { event = JSON.parse(bodyText) }
  catch { return new Response('Invalid JSON', { status: 400 }) }

  const { type, data } = event
  const mode = (Deno.env.get("STRIPE_MODE") ?? "test").toLowerCase();
  console.log(`[webhook-stripe] Evento: ${type} (modo: ${mode})`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    await supabase.from('stripe_events').upsert({
      id: event.id, type, data: data.object, processed: false,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true })

    if      (type === 'payment_intent.succeeded')         await procesarPagoCompletado(supabase, data.object.id, 'SUCCEEDED', event)
    else if (type === 'payment_intent.payment_failed')    await procesarPagoFallido(supabase, data.object.id, 'FAILED', event)
    else if (type === 'terminal.reader.action_succeeded') { const piId = data.object?.action?.process_payment_intent?.payment_intent; console.log(`Reader OK, PI: ${piId}`) }
    else if (type === 'terminal.reader.action_failed')    { const piId = data.object?.action?.process_payment_intent?.payment_intent; if (piId) await procesarPagoFallido(supabase, piId, 'READER_FAILED', event) }
    else if (type === 'checkout.session.completed')       await activarSuscripcion(supabase, data.object)
    else if (type === 'invoice.payment_succeeded')        await renovarSuscripcion(supabase, data.object)
    else if (type === 'customer.subscription.updated')    await actualizarSuscripcion(supabase, data.object)
    else if (type === 'customer.subscription.deleted')    await cancelarSuscripcion(supabase, data.object)
    else if (type === 'invoice.payment_failed')           await marcarPagoFallidoSaaS(supabase, data.object)

    await supabase.from('stripe_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', event.id)

    return new Response('OK', { status: 200 })
  } catch (e: any) {
    console.error('[webhook-stripe] Error:', e)
    await supabase.from('stripe_events').update({ error: e.message }).eq('id', event.id)
    return new Response('Internal error', { status: 500 })
  }
})

async function procesarPagoCompletado(supabase: any, paymentIntentId: string, stripeStatus: string, event: any) {
  const { data: pagos } = await supabase.from('pagos').select('id, metadata_json').eq('estado', 'pendiente')
  const pago = (pagos ?? []).find((p: any) => p.metadata_json?.stripe_payment_intent_id === paymentIntentId)
  if (!pago) return
  await supabase.from('pagos').update({ estado: 'completado', metadata_json: { ...pago.metadata_json, stripe_status: stripeStatus, stripe_event_id: event.id } }).eq('id', pago.id)
}

async function procesarPagoFallido(supabase: any, paymentIntentId: string, stripeStatus: string, event: any) {
  const { data: pagos } = await supabase.from('pagos').select('id, metadata_json').eq('estado', 'pendiente')
  const pago = (pagos ?? []).find((p: any) => p.metadata_json?.stripe_payment_intent_id === paymentIntentId)
  if (!pago) return
  await supabase.from('pagos').update({ estado: 'fallido', metadata_json: { ...pago.metadata_json, stripe_status: stripeStatus, stripe_event_id: event.id } }).eq('id', pago.id)
}

async function activarSuscripcion(supabase: any, session: any) {
  const meta = session.metadata ?? {}
  const { supabase_user_id, restaurante_id, num_usuarios } = meta
  if (!supabase_user_id) return
  const nU = Math.max(1, parseInt(num_usuarios ?? '1', 10))
  const { error } = await supabase.rpc('activar_plan', { p_restaurante_id: restaurante_id || null, p_user_id: supabase_user_id, p_plan: 'per_seat', p_billing: 'mensual', p_stripe_sub_id: session.subscription, p_num_usuarios: nU })
  if (error) throw error
  console.log(`✓ Plan per_seat (${nU}u) activado para user ${supabase_user_id}`)
}

async function renovarSuscripcion(supabase: any, invoice: any) {
  if (!invoice.subscription) return
  await supabase.from('restaurantes').update({ plan_status: 'active', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', invoice.subscription)
}

async function actualizarSuscripcion(supabase: any, subscription: any) {
  const meta = subscription.metadata ?? {}
  const { supabase_user_id, restaurante_id, num_usuarios } = meta
  if (!supabase_user_id) return
  const nU = Math.max(1, parseInt(num_usuarios ?? '1', 10))
  await supabase.rpc('activar_plan', { p_restaurante_id: restaurante_id || null, p_user_id: supabase_user_id, p_plan: 'per_seat', p_billing: 'mensual', p_stripe_sub_id: subscription.id, p_num_usuarios: nU })
}

async function cancelarSuscripcion(supabase: any, subscription: any) {
  const { error } = await supabase.rpc('cancelar_plan', { p_stripe_sub_id: subscription.id })
  if (error) throw error
}

async function marcarPagoFallidoSaaS(supabase: any, invoice: any) {
  if (!invoice.subscription) return
  await supabase.from('restaurantes').update({ plan_status: 'past_due', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', invoice.subscription)
  await supabase.from('perfiles').update({ plan_status: 'past_due', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', invoice.subscription)
}

function verificarFirmaStripe(body: string, signature: string, secret: string): boolean {
  try {
    const parts: Record<string, string> = {}
    for (const p of signature.split(',')) { const [k, v] = p.split('='); if (k && v) parts[k] = v }
    const { t: ts, v1: firma } = parts
    if (!ts || !firma) return false
    if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(ts)) > 300) return false
    const hmac = createHmac('sha256', secret)
    hmac.update(`${ts}.${body}`)
    const esperado = hmac.digest('hex')
    if (firma.length !== esperado.length) return false
    let diff = 0
    for (let i = 0; i < firma.length; i++) diff |= firma.charCodeAt(i) ^ esperado.charCodeAt(i)
    return diff === 0
  } catch { return false }
}
