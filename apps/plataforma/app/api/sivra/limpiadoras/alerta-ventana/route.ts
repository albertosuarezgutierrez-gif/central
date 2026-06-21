import { NextRequest, NextResponse } from 'next/server'
import { gmailTransporter } from '@central/core-email'
import { getSmoobuKey } from '@/lib/smoobu'
import { isCronAuthorized } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const SMOOBU_KEY = await getSmoobuKey()
    const hoy = new Date().toISOString().split('T')[0]
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    const res = await fetch(
      `https://login.smoobu.com/api/reservations?arrival_from=${hoy}&arrival_to=${d7}&pageSize=50`,
      { headers: { 'Api-Key': SMOOBU_KEY } }
    )
    const { bookings = [] } = await res.json()

    const alertas: any[] = []

    const byApt: Record<string, any[]> = {}
    for (const b of bookings) {
      const key = `${b.apartment?.id}_${b.departure}`
      if (!byApt[key]) byApt[key] = []
      byApt[key].push(b)
    }

    for (const [, group] of Object.entries(byApt)) {
      if (group.length < 2) continue
      const checkouts = group.filter((b: any) => b.departure === b.arrival?.split('T')[0])
      for (const b of checkouts) {
        const hCheckout = parseInt(b.departureTime?.slice(0, 2) || '11')
        const hCheckin = parseInt(b.arrivalTime?.slice(0, 2) || '15')
        const ventana = hCheckin - hCheckout
        if (ventana < 3) {
          alertas.push({
            apt: b.apartment?.name,
            fecha: b.departure,
            ventana_h: ventana,
            checkout: b.departureTime || '11:00',
            checkin: b.arrivalTime || '15:00',
          })
        }
      }
    }

    if (alertas.length > 0 && process.env.GMAIL_USER) {
      const transporter = gmailTransporter()
      if (transporter) {
        const html = `<div style="font-family:Arial,sans-serif;padding:20px">
          <h3 style="color:#dc2626">⚠️ Ventana ajustada de limpieza</h3>
          ${alertas.map(a => `
            <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;margin:8px 0;border-radius:4px">
              <strong>${a.apt}</strong> — ${a.fecha}<br/>
              Checkout: ${a.checkout} | Checkin: ${a.checkin} | <strong>Ventana: ${a.ventana_h}h</strong>
            </div>
          `).join('')}
        </div>`
        await transporter.sendMail({
          from: `"Plataforma Alertas" <${process.env.GMAIL_USER}>`,
          to: process.env.GMAIL_USER,
          subject: `⚠️ ${alertas.length} ventana(s) ajustada(s) próximos 7 días`,
          html,
        })
      }
    }

    return NextResponse.json({ ok: true, alertas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
