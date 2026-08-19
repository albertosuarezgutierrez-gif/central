import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ia.rest · COBRO-STRIPE v8 · con error monitoring

const STRIPE_API = 'https://api.stripe.com/v1'

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'cobro-stripe',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · STRIPE`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-restaurante-id, x-camarero-id',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any
  try { body = await req.json() }
  catch { return json({ error: 'JSON inválido' }, 400) }

  const {
    comanda_id, metodo_id, importe,
    restaurante_id, camarero_id,
    reader_id: readerIdOverride,
    persona_num,
  } = body

  if (!comanda_id || !metodo_id || !importe || !restaurante_id)
    return json({ error: 'Faltan campos: comanda_id, metodo_id, importe, restaurante_id' }, 400)
  if (typeof importe !== 'number' || importe <= 0)
    return json({ error: 'importe debe ser un número positivo' }, 400)

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY no configurado' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'iarest' } },
  )

  try {
    const { data: metodo, error: errMetodo } = await supabase
      .from('metodos_pago')
      .select('config_json, nombre')
      .eq('id', metodo_id)
      .eq('restaurante_id', restaurante_id)
      .single()

    if (errMetodo || !metodo) return json({ error: 'Método de pago no encontrado' }, 404)

    const cfg = (metodo.config_json ?? {}) as Record<string, string>
    const readerId: string = readerIdOverride ?? cfg.stripe_reader_id ?? Deno.env.get('STRIPE_READER_ID') ?? ''

    if (!readerId) {
      return json({
        error: 'reader_id no configurado. Pásalo en el body, en metodos_pago.config_json.stripe_reader_id, o en STRIPE_READER_ID secret',
      }, 400)
    }

    const importeCentimos = Math.round(importe * 100)
    const idempotencyKey  = `pi-${comanda_id.slice(0, 8)}-${persona_num ?? 'total'}-${Date.now()}`

    const piParams = new URLSearchParams({
      amount:                    String(importeCentimos),
      currency:                  'eur',
      'payment_method_types[]':  'card_present',
      capture_method:            'automatic',
      description:               `ia.rest · comanda ${comanda_id.slice(0, 8)}`,
    })

    const piRes = await stripe('POST', '/payment_intents', piParams, stripeKey, idempotencyKey)
    if (!piRes.ok) {
      const err = await piRes.json()
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'stripe',
        mensaje: `Error Stripe creando PaymentIntent: ${err?.error?.message ?? piRes.status}`,
        restaurante_id, contexto: { comanda_id, importe, error: err?.error },
      })
      return json({ error: 'Error Stripe al crear PaymentIntent', detail: err?.error?.message }, 502)
    }

    const pi = await piRes.json()
    const paymentIntentId = pi.id

    const readerParams = new URLSearchParams()
    readerParams.set('payment_intent', paymentIntentId)

    const readerRes = await stripe('POST', `/terminal/readers/${readerId}/process_payment_intent`, readerParams, stripeKey)

    if (!readerRes.ok) {
      const err = await readerRes.json()
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'stripe',
        mensaje: `Error presentando pago al datáfono: ${err?.error?.message ?? readerRes.status}`,
        restaurante_id, contexto: { comanda_id, reader_id: readerId, error: err?.error },
      })
      await stripe('POST', `/payment_intents/${paymentIntentId}/cancel`, new URLSearchParams(), stripeKey).catch(() => {})
      return json({
        error: 'Error presentando el pago al datáfono. ¿Está encendido y conectado?',
        detail: err?.error?.message, reader_id: readerId,
      }, 502)
    }

    const readerData = await readerRes.json()

    const { data: pago, error: errPago } = await supabase
      .from('pagos')
      .insert({
        restaurante_id, comanda_id, metodo_id,
        importe: Math.round(importe * 100) / 100,
        persona_num: persona_num ?? null,
        camarero_id: camarero_id ?? null,
        estado: 'pendiente',
        metadata_json: {
          stripe_payment_intent_id: paymentIntentId,
          stripe_reader_id: readerId,
          stripe_status: pi.status,
          stripe_reader_status: readerData.action?.status ?? 'in_progress',
        },
      })
      .select('id').single()

    if (errPago) {
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'stripe',
        mensaje: `PaymentIntent creado pero error al registrar pago en BD: ${errPago.message}`,
        restaurante_id, contexto: { comanda_id, payment_intent_id: paymentIntentId, error: errPago.message },
      })
      console.error('[cobro-stripe] Error insertando pago pendiente:', errPago)
    }

    return json({
      ok: true,
      pago_id: pago?.id,
      payment_intent_id: paymentIntentId,
      reader_id: readerId,
      reader_action_status: readerData.action?.status ?? 'in_progress',
      status: pi.status,
      importe_eur: importe,
      importe_cents: importeCentimos,
    })

  } catch (err: any) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'stripe',
      mensaje: String(err),
      restaurante_id,
      contexto: { error: String(err) },
    })
    console.error('[cobro-stripe] excepción:', err)
    return json({ error: String(err) }, 500)
  }
})

async function stripe(method: string, path: string, params: URLSearchParams, secretKey: string, idempotencyKey?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization:  `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-12-18.acacia',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  return fetch(`${STRIPE_API}${path}`, {
    method, headers, body: method !== 'GET' ? params.toString() : undefined,
  })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
