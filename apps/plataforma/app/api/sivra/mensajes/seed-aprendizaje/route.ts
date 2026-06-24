import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuKey } from '@/lib/smoobu'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { detectCategory } from '@/lib/sivra/agente-huesped/reglas'
import { toPropertyId } from '@/lib/sivra/agente-huesped/contexto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// GET /api/sivra/mensajes/seed-aprendizaje?pageSize=50  (auth CRON_SECRET, de un solo uso, idempotente)
// Arranque en caliente: siembra mensajes_aprendizaje con las respuestas que Alberto YA dio en
// Smoobu (sent_by_owner=true), emparejadas con la pregunta previa del huésped y clasificadas.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = await getSmoobuKey()
  const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get('pageSize') || '50'), 100)

  const list = await fetch(`https://login.smoobu.com/api/reservations?pageSize=${pageSize}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => null)
  const bookings: any[] = list?.bookings || list || []

  let sembrados = 0, revisados = 0
  for (const b of bookings) {
    const bookingId = b?.id
    if (!bookingId) continue
    const apartmentName: string = b?.apartment?.name || ''
    const propertyId = toPropertyId(b?.apartment?.id, apartmentName)

    const msgs: any[] = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}/messages`, {
      headers: { 'Api-Key': key }, cache: 'no-store',
    }).then(r => r.json()).then(d => d.messages || d || []).catch(() => [])

    // Emparejar: respuesta del anfitrión precedida de un mensaje del huésped.
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1], cur = msgs[i]
      if (!cur?.sent_by_owner || prev?.sent_by_owner) continue
      const pregunta = strip(prev.message || prev.text || '')
      const respuesta = strip(cur.message || cur.text || '')
      if (!pregunta || respuesta.length < 15) continue
      revisados++
      const categoria = detectCategory(pregunta) || 'general'
      const norm = pregunta.toLowerCase().slice(0, 300)
      // Idempotente: no duplicar la misma pregunta/respuesta para el piso.
      const r = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mensajes_aprendizaje (property_id, categoria, pregunta_norm, respuesta_final)
        SELECT ${propertyId}, ${categoria}, ${norm}, ${respuesta}
        WHERE NOT EXISTS (
          SELECT 1 FROM mensajes_aprendizaje
          WHERE property_id = ${propertyId} AND pregunta_norm = ${norm} AND respuesta_final = ${respuesta}
        )
      `).catch(() => 0)
      if (r) sembrados++
    }
  }

  return NextResponse.json({ ok: true, reservas: bookings.length, revisados, sembrados })
}
