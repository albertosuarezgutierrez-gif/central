import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { atribuirEmisor } from '@/lib/sivra/agente-huesped/atribucion'
import { listarOrdenes } from '@/lib/sivra/extras/orden-limpieza'

export const dynamic = 'force-dynamic'

function strip(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bookingId } = await context.params
  try {
    const API_KEY = await getSmoobuKey()
    const res = await fetch(
      `https://login.smoobu.com/api/reservations/${bookingId}/messages`,
      { headers: { 'Api-Key': API_KEY }, cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ messages: [] })
    const data = await res.json()
    const raw: any[] = data.messages || data || []

    const messages = raw.map((m: any) => ({
      id: String(m.id || m.created_at || Math.random()),
      from: atribuirEmisor(m),
      text: strip(m.message || m.text || ''),
      ts: m.created_at || new Date().toISOString(),
    })).filter((m: any) => m.text)

    const guest = await fetch(
      `https://login.smoobu.com/api/reservations/${bookingId}`,
      { headers: { 'Api-Key': API_KEY }, cache: 'no-store' }
    ).then(r => r.json()).catch(() => ({}))

    // 🧹 Órdenes a la limpieza de ESTA reserva (colocar cuna…). `null` viaja tal cual hasta la UI:
    // «no se ha podido leer» tiene que poder distinguirse de «no se ha pedido nada» — pintar lo
    // primero como lo segundo es afirmar una ausencia que nadie ha comprobado.
    const filas = await listarOrdenes(bookingId)
    const ordenes = filas === null ? null : filas.map(o => ({
      instruccion: o.instruccion,
      enviadoAt: o.enviado_at ? new Date(o.enviado_at).toISOString() : null,
      error: o.error,
    }))

    return NextResponse.json({
      messages,
      ordenes,
      email: guest?.guest?.email || guest?.email || '',
      guestName: guest?.guest_name || guest?.guestName || '',
      reference: String(bookingId),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
