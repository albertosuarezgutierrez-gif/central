import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuKey } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/sivra/mensajes/diagnostico-guia?reservationId=123
// Auth: Bearer CRON_SECRET (o ?secret=). SOLO LECTURA. No escribe nada.
// Objetivo: ejecutado en Vercel (donde hay key + red), reporta si guest-app-url
// devuelve HTML legible o cascarón JS, y vuelca los campos reales de reserva/apartamento.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = await getSmoobuKey()
  const reservationId = req.nextUrl.searchParams.get('reservationId')

  // 1) Si no pasan reserva, coge la primera reciente para tener un guest-app-url real.
  let resId = reservationId
  if (!resId) {
    const list = await fetch('https://login.smoobu.com/api/reservations?pageSize=1', {
      headers: { 'Api-Key': key }, cache: 'no-store',
    }).then(r => r.json()).catch(() => null)
    resId = String(list?.bookings?.[0]?.id ?? list?.[0]?.id ?? '')
  }
  if (!resId) return NextResponse.json({ error: 'sin reservas para sondear' }, { status: 404 })

  // 2) Reserva (campos + guest-app-url) y apartamento (campos estructurados).
  const reserva = await fetch(`https://login.smoobu.com/api/reservations/${resId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => ({} as any))

  const apartmentId = reserva?.apartment?.id ?? reserva?.apartmentId
  const apartamento = apartmentId
    ? await fetch(`https://login.smoobu.com/api/apartments/${apartmentId}`, {
        headers: { 'Api-Key': key }, cache: 'no-store',
      }).then(r => r.json()).catch(() => ({} as any))
    : null

  // 3) Descarga la guest-app-url y mide si trae texto o es cascarón JS.
  const guestUrl: string | null = reserva?.['guest-app-url'] || null
  let guia: Record<string, unknown> = { url: guestUrl, fetched: false }
  if (guestUrl) {
    try {
      const r = await fetch(guestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
      const html = await r.text()
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                       .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      guia = {
        url: guestUrl, fetched: true, status: r.status,
        contentType: r.headers.get('content-type'),
        htmlLength: html.length, textLength: text.length,
        // Heurística: mucho texto plano ⇒ HTML legible; casi nada ⇒ SPA JS.
        veredicto: text.length > 400 ? 'HTML_LEGIBLE' : 'PROBABLE_SPA_JS',
        textSample: text.slice(0, 800),
      }
    } catch (e: any) {
      guia = { url: guestUrl, fetched: false, error: e?.message }
    }
  }

  return NextResponse.json({
    reservationId: resId,
    reservaKeys: Object.keys(reserva || {}),
    guestAppUrl: guestUrl,
    apartamentoKeys: apartamento ? Object.keys(apartamento) : null,
    apartamento,
    guia,
  })
}
