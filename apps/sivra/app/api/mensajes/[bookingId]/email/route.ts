import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API_KEY = process.env.SMOOBU_API_KEY || ''

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await context.params
    if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

    const res = await fetch(
      `https://login.smoobu.com/api/reservations/${bookingId}`,
      { headers: { 'Api-Key': API_KEY }, cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Smoobu ${res.status}`)
    const data = await res.json()

    return NextResponse.json({
      email:     data.email     || null,
      guestName: data['guest-name'] || data.firstname || 'Huésped',
      bookingId: bookingId,
      reference: data.reference_id || data.id || bookingId,
      portal:    data.channel?.name || 'OTRO',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
