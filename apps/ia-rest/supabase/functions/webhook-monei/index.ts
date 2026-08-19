import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'

// ia.rest · WEBHOOK-MONEI v9 · con error monitoring

const ESTADOS_OK = ['SUCCEEDED', 'AUTHORIZED']
const ESTADOS_KO = ['FAILED', 'CANCELED', 'EXPIRED', 'REFUNDED']

async function reportarError(supabase: any, params: {
  nivel: 'info'|'warning'|'critical', categoria: string,
  mensaje: string, restaurante_id?: string|null, contexto?: any
}) {
  try {
    await supabase.from('system_errors').insert({
      nivel: params.nivel, categoria: params.categoria,
      mensaje: params.mensaje, funcion_origen: 'webhook-monei',
      restaurante_id: params.restaurante_id ?? null,
      contexto: params.contexto ?? null,
    })
    if (params.nivel === 'critical') {
      supabase.functions.invoke('push-send', {
        body: {
          restaurante_id: params.restaurante_id ?? 'GLOBAL',
          titulo: `🔴 Error crítico · MONEI WEBHOOK`,
          mensaje: params.mensaje,
          datos: { tipo: 'system_error', nivel: 'critical' },
        }
      }).catch(() => {})
    }
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let bodyText: string
  try { bodyText = await req.text() }
  catch { return new Response('Bad request', { status: 400 }) }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'iarest' } },
  )

  const moneiSignature = req.headers.get('MONEI-Signature') ?? ''
  const webhookSecret  = Deno.env.get('MONEI_WEBHOOK_SECRET')

  if (webhookSecret && moneiSignature) {
    if (!verificarFirma(bodyText, moneiSignature, webhookSecret)) {
      await reportarError(supabase, {
        nivel: 'warning', categoria: 'stripe',
        mensaje: 'Firma de webhook MONEI inválida — posible ataque o misconfiguración',
        contexto: { signature: moneiSignature.substring(0, 40) },
      })
      console.warn('[webhook-monei] Firma inválida')
      return new Response('Unauthorized', { status: 401 })
    }
  } else if (!webhookSecret) {
    console.warn('[webhook-monei] MONEI_WEBHOOK_SECRET no configurado — skip verificación')
  }

  let payload: any
  try { payload = JSON.parse(bodyText) }
  catch { return new Response('Invalid JSON', { status: 400 }) }

  const { id: moneiPaymentId, status } = payload
  if (!moneiPaymentId) return new Response('Missing payment id', { status: 400 })

  console.log(`[webhook-monei] v9 Pago ${moneiPaymentId} → ${status}`)

  try {
    if (ESTADOS_OK.includes(status)) {
      const { data: pagos, error: errBusca } = await supabase
        .from('pagos').select('id, metadata_json, restaurante_id').eq('estado', 'pendiente')

      if (errBusca) throw errBusca

      const pagoPendiente = (pagos ?? []).find(
        (p: any) => p.metadata_json?.monei_payment_id === moneiPaymentId
      )

      if (!pagoPendiente) {
        console.log(`[webhook-monei] Pago ${moneiPaymentId} no encontrado o ya procesado`)
        return new Response('OK', { status: 200 })
      }

      const { error: errUpdate } = await supabase
        .from('pagos')
        .update({
          estado: 'completado',
          metadata_json: {
            ...pagoPendiente.metadata_json,
            monei_status: status,
            monei_confirmed_at: new Date().toISOString(),
          },
        })
        .eq('id', pagoPendiente.id)

      if (errUpdate) throw errUpdate
      console.log(`[webhook-monei] ✓ Pago ${pagoPendiente.id} completado`)

    } else if (ESTADOS_KO.includes(status)) {
      const { data: pagos } = await supabase
        .from('pagos').select('id, metadata_json, restaurante_id').eq('estado', 'pendiente')

      const pagoPendiente = (pagos ?? []).find(
        (p: any) => p.metadata_json?.monei_payment_id === moneiPaymentId
      )

      if (pagoPendiente) {
        await supabase.from('pagos').update({
          estado: 'fallido',
          metadata_json: { ...pagoPendiente.metadata_json, monei_status: status },
        }).eq('id', pagoPendiente.id)

        // Pago Bizum fallido → warning
        await reportarError(supabase, {
          nivel: 'warning', categoria: 'stripe',
          mensaje: `Pago Bizum ${status.toLowerCase()}: ${moneiPaymentId.substring(0, 20)}...`,
          restaurante_id: pagoPendiente.restaurante_id,
          contexto: { monei_payment_id: moneiPaymentId, status, pago_id: pagoPendiente.id },
        })
        console.log(`[webhook-monei] ✗ Pago ${pagoPendiente.id} fallido (${status})`)
      }
    }

    return new Response('OK', { status: 200 })

  } catch (e: any) {
    await reportarError(supabase, {
      nivel: 'critical', categoria: 'stripe',
      mensaje: `Error procesando webhook MONEI: ${String(e)}`,
      contexto: { monei_payment_id: moneiPaymentId, status, error: String(e) },
    })
    console.error('[webhook-monei] Error:', e)
    return new Response('OK', { status: 200 }) // 200 para que MONEI no reintente
  }
})

function verificarFirma(body: string, signature: string, secret: string): boolean {
  try {
    const parts: Record<string, string> = {}
    for (const part of signature.split(',')) {
      const [k, v] = part.split('=')
      if (k && v) parts[k] = v
    }
    const { t: timestamp, v1: firma } = parts
    if (!timestamp || !firma) return false
    const hmac = createHmac('sha256', secret)
    hmac.update(`${timestamp}.${body}`)
    const esperado = hmac.digest('hex')
    if (firma.length !== esperado.length) return false
    let diff = 0
    for (let i = 0; i < firma.length; i++) diff |= firma.charCodeAt(i) ^ esperado.charCodeAt(i)
    return diff === 0
  } catch { return false }
}
