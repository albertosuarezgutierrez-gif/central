export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Stripe from 'stripe'
import { tgAlert } from '@/lib/telegram'
import { Resend } from 'resend'
import { periodoStr, trimestreActual } from '@/lib/contabilidad'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as never,
})
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_OPERADOR!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  const sb = createServerClient()

  switch (event.type) {

    case 'checkout.session.completed': {
      const s = event.data.object as any
      const cuenta_id = s.metadata?.cuenta_id
      if (!cuenta_id || !s.subscription) break

      const sub = await stripe.subscriptions.retrieve(s.subscription as string) as any
      const proximoCobro = new Date(sub.current_period_end * 1000).toISOString()

      await sb.from('cuentas').update({
        stripe_subscription_id: s.subscription as string,
        stripe_estado: 'activa',
        fecha_inicio_suscripcion: new Date().toISOString(),
        fecha_proximo_cobro: proximoCobro,
      }).eq('id', cuenta_id)

      const { data: cuenta } = await sb
        .from('cuentas').select('nombre, precio_mensual').eq('id', cuenta_id).single()

      await tgAlert(
        `💳 <b>Suscripción activada</b>\n${cuenta?.nombre}\n${cuenta?.precio_mensual}€/mes`,
        'resuelto'
      )
      break
    }

    case 'invoice.payment_succeeded': {
      const inv = event.data.object as any
      if (!inv.subscription) break

      const { data: cuenta } = await sb
        .from('cuentas')
        .select('id, nombre, email, precio_mensual')
        .eq('stripe_subscription_id', inv.subscription as string)
        .single()
      if (!cuenta) break

      const sub = await stripe.subscriptions.retrieve(inv.subscription as string) as any
      const proximoCobro = new Date(sub.current_period_end * 1000).toISOString()
      await sb.from('cuentas').update({
        stripe_estado: 'activa',
        fecha_proximo_cobro: proximoCobro,
      }).eq('id', cuenta.id)

      const fechaFactura = new Date(inv.created * 1000)
      const mesAno = fechaFactura.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      const importeTotal = (inv.amount_paid / 100) as number
      const importeBase = (inv.subtotal / 100) as number
      const importeIva = ((inv.tax ?? 0) / 100) as number
      const numeroFactura = inv.number ?? `INV-${(inv.id as string).slice(-8).toUpperCase()}`
      const pdfUrl = inv.invoice_pdf as string | null
      const hostedUrl = inv.hosted_invoice_url as string | null
      const tieneIva = importeIva > 0

      // 1. EMAIL al cliente
      if (cuenta.email) {
        await resend.emails.send({
          from: 'ia.rest <facturacion@iarest.es>',
          to: cuenta.email,
          subject: `Factura ia.rest — ${mesAno} (${numeroFactura})`,
          html: `
            <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
              <div style="background:#14110E;padding:28px 32px;border-radius:12px 12px 0 0;">
                <h1 style="color:#F6F1E7;font-size:22px;margin:0;">ia.rest</h1>
                <p style="color:#9C8E7E;margin:4px 0 0;font-size:14px;">Factura de suscripción</p>
              </div>
              <div style="background:#FAFAFA;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #E5E5E5;border-top:none;">
                <p style="color:#444;font-size:15px;margin:0 0 24px;">
                  Hola, adjuntamos la factura de <strong>${mesAno}</strong> de tu suscripción a ia.rest.
                </p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                  <tr style="border-bottom:1px solid #E5E5E5;">
                    <td style="padding:10px 0;color:#666;font-size:14px;">Nº Factura</td>
                    <td style="padding:10px 0;text-align:right;font-weight:600;font-size:14px;">${numeroFactura}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #E5E5E5;">
                    <td style="padding:10px 0;color:#666;font-size:14px;">Fecha</td>
                    <td style="padding:10px 0;text-align:right;font-size:14px;">${fechaFactura.toLocaleDateString('es-ES')}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #E5E5E5;">
                    <td style="padding:10px 0;color:#666;font-size:14px;">Servicio</td>
                    <td style="padding:10px 0;text-align:right;font-size:14px;">ia.rest — ${mesAno}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #E5E5E5;">
                    <td style="padding:10px 0;color:#666;font-size:14px;">Base imponible</td>
                    <td style="padding:10px 0;text-align:right;font-size:14px;">${importeBase.toFixed(2)}€</td>
                  </tr>
                  ${tieneIva ? `
                  <tr style="border-bottom:1px solid #E5E5E5;">
                    <td style="padding:10px 0;color:#666;font-size:14px;">IVA (21%)</td>
                    <td style="padding:10px 0;text-align:right;font-size:14px;">${importeIva.toFixed(2)}€</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding:14px 0 4px;font-weight:700;font-size:16px;">Total pagado</td>
                    <td style="padding:14px 0 4px;text-align:right;font-weight:700;font-size:16px;color:#D9442B;">${importeTotal.toFixed(2)}€</td>
                  </tr>
                </table>
                <div>
                  ${pdfUrl ? `<a href="${pdfUrl}" style="background:#14110E;color:#F6F1E7;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;margin-right:10px;">📄 Descargar PDF</a>` : ''}
                  ${hostedUrl ? `<a href="${hostedUrl}" style="background:#F0EDE8;color:#14110E;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">Ver factura online</a>` : ''}
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;">
                  Para cualquier consulta escríbenos a soporte@iarest.es
                </p>
              </div>
            </div>
          `,
        })
      }

      // 2. ASIENTO CONTABLE en el restaurante
      const { data: restaurante } = await sb
        .from('restaurantes')
        .select('id')
        .eq('cuenta_id', cuenta.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (restaurante) {
        const fechaAsientoStr = fechaFactura.toISOString().split('T')[0]
        const numAsiento = ((await sb.rpc('siguiente_num_asiento', {
          p_restaurante_id: restaurante.id,
        })).data as number) ?? 1

        const { year, trimestre } = trimestreActual()

        const lineas = [
          {
            cuenta: '629',
            nombre_cuenta: 'Otros servicios — Software SaaS',
            debe: importeBase,
            haber: 0,
            concepto: `ia.rest — ${mesAno}`,
          },
          ...(tieneIva ? [{
            cuenta: '472',
            nombre_cuenta: 'HP IVA soportado 21%',
            debe: importeIva,
            haber: 0,
            concepto: `IVA 21% ia.rest ${mesAno}`,
          }] : []),
          {
            cuenta: '410',
            nombre_cuenta: 'Acreedores por prestaciones de servicios',
            debe: 0,
            haber: importeTotal,
            concepto: `Factura ${numeroFactura} — ia.rest`,
          },
        ]

        await sb.from('asientos_contables').insert({
          restaurante_id: restaurante.id,
          num_asiento: numAsiento,
          fecha: fechaAsientoStr,
          concepto: `Suscripción ia.rest — ${mesAno}`,
          tipo: 'gasto',
          lineas,
          origen_tipo: 'stripe_saas',
          origen_id: inv.id as string,
          periodo: periodoStr(year, trimestre),
          estado: 'borrador',
        })
      }

      await tgAlert(
        `✅ <b>Cobro exitoso</b>\n${cuenta.nombre} — ${importeTotal.toFixed(2)}€\nFactura ${numeroFactura} enviada`,
        'info'
      )
      break
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as any
      if (!inv.subscription) break

      const { data: cuenta } = await sb
        .from('cuentas')
        .select('id, nombre, email')
        .eq('stripe_subscription_id', inv.subscription as string)
        .single()
      if (!cuenta) break

      await sb.from('cuentas').update({ stripe_estado: 'impago' }).eq('id', cuenta.id)

      if (cuenta.email) {
        await resend.emails.send({
          from: 'ia.rest <facturacion@iarest.es>',
          to: cuenta.email,
          subject: 'Problema con tu pago de ia.rest',
          html: `
            <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;">
              <div style="background:#14110E;padding:28px 32px;border-radius:12px 12px 0 0;">
                <h1 style="color:#F6F1E7;font-size:22px;margin:0;">ia.rest</h1>
              </div>
              <div style="background:#FAFAFA;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #E5E5E5;border-top:none;">
                <p style="color:#444;font-size:15px;">
                  No hemos podido procesar el pago de tu suscripción. Actualiza tu método de pago para continuar usando ia.rest sin interrupciones.
                </p>
                ${inv.hosted_invoice_url ? `
                <a href="${inv.hosted_invoice_url}" style="background:#D9442B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px;">
                  Actualizar método de pago
                </a>` : ''}
                <p style="color:#999;font-size:12px;margin-top:24px;">¿Dudas? Escríbenos a soporte@iarest.es</p>
              </div>
            </div>
          `,
        })
      }

      await tgAlert(
        `🔴 <b>COBRO FALLIDO</b>\n${cuenta.nombre}\nEmail de aviso enviado al cliente`,
        'critico'
      )
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as any
      const cuenta_id = sub.metadata?.cuenta_id
      if (!cuenta_id) break

      await sb.from('cuentas').update({
        stripe_estado: 'cancelada',
        stripe_subscription_id: null,
      }).eq('id', cuenta_id)

      const { data: cuenta } = await sb
        .from('cuentas').select('nombre').eq('id', cuenta_id).single()

      await tgAlert(`⚠️ Suscripción cancelada: ${cuenta?.nombre}`, 'aviso')
      break
    }
  }

  return NextResponse.json({ received: true })
}
