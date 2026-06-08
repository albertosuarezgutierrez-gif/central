import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const API_KEY = process.env.SMOOBU_API_KEY || ''

function strip(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

// Next.js 15: params es Promise
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params
  try {
    const res = await fetch(
      `https://login.smoobu.com/api/reservations/${bookingId}/messages`,
      { headers: { 'Api-Key': API_KEY }, cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ messages: [] })
    const data = await res.json()
    const raw: any[] = data.messages || data || []

    const messages = raw.map((m: any) => ({
      id: String(m.id || m.created_at || Math.random()),
      from: m.sent_by_owner ? 'host' : 'guest',
      text: strip(m.message || m.text || ''),
      ts: m.created_at || new Date().toISOString(),
    })).filter((m: any) => m.text)

    const guest = await fetch(
      `https://login.smoobu.com/api/reservations/${bookingId}`,
      { headers: { 'Api-Key': API_KEY }, cache: 'no-store' }
    ).then(r => r.json()).catch(() => ({}))

    return NextResponse.json({
      messages,
      email: guest?.guest?.email || guest?.email || '',
      guestName: guest?.guest_name || guest?.guestName || '',
      reference: String(bookingId),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH: persiste cambio de estado en mensajes_status ──
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params
  const body = await req.json().catch(() => ({}))
  const { status } = body

  const VALID = ['pendiente', 'respondido', 'urgente']
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mensajes_status (booking_id, status, updated_at)
      VALUES (${bookingId}, ${status}, now())
      ON CONFLICT (booking_id)
      DO UPDATE SET status = ${status}, updated_at = now()
    `)
    return NextResponse.json({ ok: true, bookingId, status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
