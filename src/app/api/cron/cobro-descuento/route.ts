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

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as never })

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

  const ahora = new Date()
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const mesStr   = mesAnterior.toISOString().slice(0, 10)
  const mesLabel = mesAnterior.toLocaleString('es', { month: 'long', year: 'numeric' })

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

  const restauranteIds = descuentos.map((d: any) => d.restaurante_id)

  const [{ data: cuentas }, { data: restaurantes }] = await Promise.all([
    supabase.from('cuentas').select('id, stripe_customer_id').not('stripe_customer_id', 'is', null),
    supabase.from('restaurantes').select('id, nombre, cuenta_id').in('id', restauranteIds),
  ])

  const customerMap: Record<string, string> = {}
  for (const r of restaurantes || []) {
    const cuenta = (cuentas || []).find((c: any) => c.id === r.cuenta_id)
    if (cuenta?.stripe_customer_id) customerMap[r.id] = cuenta.stripe_customer_id
  }

  const log: string[] = []

  // ── Paralelo: aplicar créditos Stripe a la vez ────────────────
  const resultados = await Promise.allSettled(
    (descuentos as any[]).map(async (d) => {
      const customerId = customerMap[d.restaurante_id]
      if (!customerId) {
        log.push(`${d.restaurante_id}: sin stripe_customer_id — omitido`)
        return { omitido: true }
      }

      const importeCentimos = Math.round(d.descuento_cuota_eur * 100) * -1

      await getStripe().customers.createBalanceTransaction(customerId, {
        amount: importeCentimos,
        currency: 'eur',
        description: `ia.rest cobro — descuento ${mesLabel}: ${d.volumen_eur.toFixed(2)}€ procesados`,
        metadata: {
          local_id: d.restaurante_id,
          mes: mesStr,
          volumen_eur:    d.volumen_eur.toString(),
          comision_eur:   d.comision_eur.toString(),
          descuento_eur:  d.descuento_cuota_eur.toString(),
        },
      })

      log.push(`${d.restaurante_id}: -${d.descuento_cuota_eur}€ aplicados como crédito Stripe`)
      return { aplicado: true }
    })
  )

  const aplicados = resultados.filter(r => r.status === 'fulfilled' && (r.value as any)?.aplicado).length
  const omitidos  = resultados.filter(r => r.status === 'fulfilled' && (r.value as any)?.omitido).length
  const errores   = resultados.filter(r => r.status === 'rejected').length

  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      const rid = (descuentos as any[])[i]?.restaurante_id
      log.push(`${rid}: ERROR — ${(r.reason as Error)?.message ?? r.reason}`)
      console.error(`[cobro-descuento] Error en ${rid}:`, r.reason)
    }
  })

  return NextResponse.json({
    ok: true,
    mes: mesStr,
    procesados: descuentos.length,
    aplicados,
    omitidos,
    errores,
    log,
  })
}
