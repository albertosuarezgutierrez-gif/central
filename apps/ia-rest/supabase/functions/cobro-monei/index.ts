import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ia.rest · COBRO-MONEI v8 · con error monitoring

const MONEI_API = 'https://api.monei.com/v1'

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'cobro-monei',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · MONEI`,
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-restaurante-id, x-camarero-id',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any
  try { body = await req.json() }
  catch { return json({ error: 'JSON inválido' }, 400) }

  const { comanda_id, metodo_id, importe, restaurante_id, camarero_id } = body

  if (!comanda_id || !metodo_id || !importe || !restaurante_id)
    return json({ error: 'Faltan campos requeridos: comanda_id, metodo_id, importe, restaurante_id' }, 400)
  if (typeof importe !== 'number' || importe <= 0)
    return json({ error: 'El importe debe ser un número positivo' }, 400)

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

    const moneiApiKey: string =
      (metodo.config_json as any)?.monei_api_key ??
      Deno.env.get('MONEI_API_KEY') ?? ''

    if (!moneiApiKey) {
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'stripe', // reutilizamos 'stripe' para pagos
        mensaje: 'MONEI API key no configurada — cobro Bizum bloqueado',
        restaurante_id, contexto: { metodo_id, comanda_id },
      })
      return json({ error: 'MONEI API key no configurada' }, 500)
    }

    const importeCentimos = Math.round(importe * 100)
    const orderId = `ia-rest-${comanda_id.slice(0, 8)}-${Date.now()}`
    const appUrl = Deno.env.get('APP_URL') ?? 'https://ia-rest.vercel.app'

    const moneiRes = await fetch(`${MONEI_API}/payments`, {
      method: 'POST',
      headers: { 'Authorization': moneiApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: importeCentimos, currency: 'EUR', orderId,
        description: 'Cobro mesa · ia.rest',
        paymentMethods: ['bizum'],
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-monei`,
        completeUrl: `${appUrl}/cobro/completado?comanda=${comanda_id}`,
        cancelUrl:   `${appUrl}/cobro/cancelado?comanda=${comanda_id}`,
      }),
    })

    if (!moneiRes.ok) {
      const errText = await moneiRes.text()
      await reportarError(supabase, {
        nivel: 'critical', categoria: 'stripe',
        mensaje: `MONEI error ${moneiRes.status} creando pago Bizum`,
        restaurante_id, contexto: { status: moneiRes.status, comanda_id, importe, detalle: errText.substring(0, 200) },
      })
      console.error('[cobro-monei] MONEI error:', moneiRes.status, errText)
      return json({ error: `Error MONEI: ${moneiRes.status}`, detail: errText }, 502)
    }

    const moneiData = await moneiRes.json()
    const { id: moneiPaymentId, paymentUrl, status } = moneiData

    const { data: pago, error: errPago } = await supabase
      .from('pagos')
      .insert({
        restaurante_id, comanda_id, metodo_id,
        importe: Math.round(importe * 100) / 100,
        camarero_id: camarero_id ?? null,
        estado: 'pendiente',
        metadata_json: {
          monei_payment_id: moneiPaymentId,
          monei_status: status,
          monei_payment_url: paymentUrl,
          monei_order_id: orderId,
        },
      })
      .select('id').single()

    if (errPago) {
      // Pago creado en MONEI pero no registrado en BD — warning (el webhook lo recuperará)
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'stripe',
        mensaje: `Pago MONEI creado pero error en BD: ${errPago.message}`,
        restaurante_id, contexto: { monei_payment_id: moneiPaymentId, comanda_id, error: errPago.message },
      })
      console.error('[cobro-monei] Error insertando pago:', errPago)
    }

    return json({
      ok: true, pago_id: pago?.id,
      monei_payment_id: moneiPaymentId,
      payment_url: paymentUrl, status,
      importe_eur: importe, importe_cents: importeCentimos,
    })

  } catch (e: any) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'stripe',
      mensaje: `Excepción inesperada en cobro-monei: ${String(e)}`,
      restaurante_id, contexto: { error: String(e), comanda_id },
    })
    console.error('[cobro-monei] Error inesperado:', e)
    return json({ error: 'Error interno', detail: String(e) }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
