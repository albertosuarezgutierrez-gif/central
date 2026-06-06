// GET /api/cron/cobro-inactividad
// Vercel Cron: cada 5 minutos
// Detecta sesiones QR abiertas sin pago pasado el timer configurado por el dueño
// y envía push al camarero asignado
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as never })
const COMISION_RATE = 0.005

// Cierre automático de cuentas INDIVIDUALES con tarjeta guardada (pre_auth) que llevan
// más del timer del dueño sin cerrar. Cobra a cada una SOLO su consumición (sesion_qr_id).
// Es la red de seguridad del "cerrar mi cuenta": si el cliente se va sin pulsar, se cobra solo.
async function autoCerrarIndividuales(supabase: ReturnType<typeof createServerClient>): Promise<number> {
  const { data: sesiones } = await supabase
    .from('qr_sesiones_cliente')
    .select('id, restaurante_id, creado_en, preauth_payment_method_id, precio_fijo_aplicado')
    .eq('tipo', 'individual')
    .eq('estado', 'activa')
    .eq('preauth_completado', true)
    .not('preauth_payment_method_id', 'is', null)

  if (!sesiones?.length) return 0

  // Timer + modo de cobro por restaurante (solo auto-cobramos si el dueño eligió pre_auth)
  const restIds = [...new Set(sesiones.map((s: any) => s.restaurante_id))]
  const { data: configs } = await supabase
    .from('cobro_config')
    .select('restaurante_id, timer_inactividad_min, modo_cobro')
    .in('restaurante_id', restIds)
  const cfgMap = new Map((configs || []).map((c: any) => [c.restaurante_id, c]))

  const stripe = getStripe()
  const ahora = Date.now()

  const resultados = await Promise.allSettled(
    sesiones.map(async (s: any) => {
      const cfg = cfgMap.get(s.restaurante_id)
      if (!cfg || cfg.modo_cobro !== 'pre_auth') return false
      const timerMin = cfg.timer_inactividad_min || 45
      const edadMin = (ahora - new Date(s.creado_en).getTime()) / 60000
      if (edadMin < timerMin) return false

      // Total de ESTA subcuenta (subtotal + IVA 10% + precio fijo)
      const { data: items } = await supabase
        .from('comanda_items')
        .select('precio_unitario, cantidad, comandas!inner(sesion_qr_id, origen)')
        .eq('comandas.sesion_qr_id', s.id)
        .eq('comandas.origen', 'qr_cliente')
      let subtotal = 0
      for (const it of items || []) subtotal += (it.precio_unitario || 0) * (it.cantidad || 0)
      const total = subtotal * 1.10 + (s.precio_fijo_aplicado || 0)
      if (total <= 0) {
        // Nada que cobrar: cerramos la sesión para no reintentar eternamente
        await supabase.from('qr_sesiones_cliente').update({ estado: 'abandonada' }).eq('id', s.id)
        return false
      }

      const { data: rest } = await supabase
        .from('restaurantes').select('stripe_account_id').eq('id', s.restaurante_id).single()

      const importeCentimos = Math.round(total * 100)
      const comisionCentimos = Math.round(importeCentimos * COMISION_RATE)

      const pi = await stripe.paymentIntents.create(
        {
          amount: importeCentimos,
          currency: 'eur',
          payment_method: s.preauth_payment_method_id,
          confirm: true,
          off_session: true,
          application_fee_amount: comisionCentimos,
          metadata: { sesion_id: s.id, restaurante_id: s.restaurante_id, tipo: 'qr_cobro_auto_inactividad' },
        },
        rest?.stripe_account_id ? { stripeAccount: rest.stripe_account_id } : {}
      )

      if (pi.status !== 'succeeded') return false

      const totalEur = Math.round(total * 100) / 100
      await supabase.from('qr_sesiones_cliente').update({
        estado: 'pagada', pagado_en: new Date().toISOString(),
        total_cobrado: totalEur, payment_intent_id: pi.id,
      }).eq('id', s.id)

      await supabase.rpc('registrar_pago_cobro', {
        p_restaurante_id: s.restaurante_id,
        p_importe_eur: totalEur,
        p_comision_eur: Math.round(totalEur * COMISION_RATE * 100) / 100,
      }).then(() => {}, () => {})

      return true
    })
  )
  return resultados.filter(r => r.status === 'fulfilled' && r.value === true).length
}

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

  // RGPD / minimización (backstop): purgar avisos QR de hace >6h. Cubre las mesas
  // en modo sin_pago que cierra el camarero en barra (no pasan por el webhook de
  // Stripe). El dato útil dura minutos; aquí garantizamos que nada queda guardado.
  try {
    const hace6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    await supabase.from('qr_avisos_suscripciones').delete().lt('creado_en', hace6h)
  } catch (e) {
    console.error('[cobro-inactividad] purga avisos QR:', e)
  }

  // Limpieza de cobros de grupo "pendiente" caducados: filas creadas hace >48h que
  // nunca llegaron a pagarse (checkouts abandonados o fallidos). Es seguro borrarlas
  // porque la sesión de Stripe Checkout caduca a las 24h → ya no se pueden cobrar, así
  // que no se pierde ningún pago futuro; solo evitamos que esos intentos ensucien el
  // panel del portal (contadores de "pendientes" e importes inflados).
  try {
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('cobros_grupo_pagos')
      .delete()
      .eq('estado', 'pendiente')
      .lt('created_at', hace48h)
  } catch (e) {
    console.error('[cobro-inactividad] purga cobros_grupo pendientes:', e)
  }

  // Auto-cierre de cuentas individuales con tarjeta guardada (red de seguridad del "cerrar mi cuenta")
  let cobradasAuto = 0
  try {
    cobradasAuto = await autoCerrarIndividuales(supabase)
  } catch (e) {
    console.error('[cobro-inactividad] auto-cierre individuales:', e)
  }

  const { data: sesiones, error } = await supabase.rpc('get_sesiones_inactivas')

  if (error) {
    console.error('[cobro-inactividad] Error obteniendo sesiones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sesiones || sesiones.length === 0) {
    return NextResponse.json({ ok: true, procesadas: 0, cobradas_auto: cobradasAuto })
  }

  const pushUrl  = `${process.env.SUPABASE_URL}/functions/v1/push-send`
  const pushAuth = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  // ── Paralelo: todas las sesiones a la vez ─────────────────────
  const resultados = await Promise.allSettled(
    sesiones.map(async (s: any) => {
      const minutos = Math.round(s.minutos_abierta)

      const { data: camareros } = await supabase
        .from('personal')
        .select('id, nombre')
        .eq('restaurante_id', s.restaurante_id)
        .in('rol', ['camarero', 'jefe_sala'])
        .eq('activo', true)

      if (!camareros || camareros.length === 0) return

      // Push a todos los camareros del restaurante en paralelo
      await Promise.allSettled(
        camareros.map((cam: any) =>
          fetch(pushUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': pushAuth },
            body: JSON.stringify({
              camarero_id: cam.id,
              titulo: `⏱ Mesa ${s.mesa_codigo} sin pagar`,
              cuerpo: `Lleva ${minutos} minutos abierta sin cerrar el QR`,
              datos: {
                tipo: 'qr_inactividad',
                mesa_id: s.mesa_id,
                sesion_id: s.sesion_id,
                minutos_abierta: minutos,
              }
            })
          })
        )
      )

      await supabase
        .from('qr_sesiones_cliente')
        .update({ inactividad_alerta_enviada: true })
        .eq('id', s.sesion_id)
    })
  )

  const enviadas = resultados.filter(r => r.status === 'fulfilled').length
  const errores  = resultados.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    procesadas: sesiones.length,
    alertas_enviadas: enviadas,
    errores,
    cobradas_auto: cobradasAuto,
  })
}
