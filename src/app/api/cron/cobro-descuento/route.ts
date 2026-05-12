// GET /api/cron/cobro-descuento
// Vercel Cron: día 1 de cada mes a las 02:00
// Calcula el descuento ganado el mes anterior por ia.rest cobro
// y lo aplica como customer.balance credit en Stripe
// → la siguiente factura SaaS se reduce automáticamente
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Mes anterior (ej: si hoy es 1 junio, calculamos mayo)
  const ahora = new Date()
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const mesStr = mesAnterior.toISOString().slice(0, 10) // '2026-05-01'
  const mesLabel = mesAnterior.toLocaleString('es', { month: 'long', year: 'numeric' })

  // Obtener descuentos del mes anterior por restaurante
  const { data: descuentos, error } = await supabase
    .from('resumen_cobros_mensual')
    .select('restaurante_id, descuento_cuota_eur, volumen_eur, comision_eur')
    .eq('mes', mesStr)
    .gt('descuento_cuota_eur', 0)

  if (error) {
    console.error('[cobro-descuento] Error leyendo resumen:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!descuentos || descuentos.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0, mensaje: `Sin descuentos en ${mesLabel}` })
  }

  // Obtener stripe_customer_id de cada restaurante (a través de cuentas)
  const restauranteIds = descuentos.map((d: any) => d.restaurante_id)

  const { data: cuentas } = await supabase
    .from('cuentas')
    .select('id, stripe_customer_id')
    .not('stripe_customer_id', 'is', null)

  const { data: restaurantes } = await supabase
    .from('restaurantes')
    .select('id, nombre, cuenta_id')
    .in('id', restauranteIds)

  // Mapa restaurante_id → stripe_customer_id
  const customerMap: Record<string, string> = {}
  for (const r of restaurantes || []) {
    const cuenta = (cuentas || []).find((c: any) => c.id === r.cuenta_id)
    if (cuenta?.stripe_customer_id) {
      customerMap[r.id] = cuenta.stripe_customer_id
    }
  }

  let aplicados = 0
  let omitidos = 0
  const log: string[] = []

  for (const d of descuentos as any[]) {
    const customerId = customerMap[d.restaurante_id]
    if (!customerId) {
      log.push(`${d.restaurante_id}: sin stripe_customer_id — omitido`)
      omitidos++
      continue
    }

    const importeCentimos = Math.round(d.descuento_cuota_eur * 100) * -1 // negativo = crédito

    try {
      // Aplicar crédito en la cuenta del cliente Stripe
      // Un balance negativo se descuenta automáticamente de la siguiente factura
      await getStripe().customers.createBalanceTransaction(customerId, {
        amount: importeCentimos,
        currency: 'eur',
        description: `ia.rest cobro — descuento ${mesLabel}: ${d.volumen_eur.toFixed(2)}€ procesados`,
        metadata: {
          restaurante_id: d.restaurante_id,
          mes: mesStr,
          volumen_eur: d.volumen_eur.toString(),
          comision_eur: d.comision_eur.toString(),
          descuento_eur: d.descuento_cuota_eur.toString(),
        },
      })

      log.push(`${d.restaurante_id}: -${d.descuento_cuota_eur}€ aplicados como crédito Stripe`)
      aplicados++
    } catch (e: any) {
      log.push(`${d.restaurante_id}: ERROR — ${e.message}`)
      console.error(`[cobro-descuento] Error en ${d.restaurante_id}:`, e)
    }
  }

  return NextResponse.json({
    ok: true,
    mes: mesStr,
    procesados: descuentos.length,
    aplicados,
    omitidos,
    log,
  })
}
