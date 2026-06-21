import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

// Aviso de entrada/salida anticipada del huésped → sesión de limpieza.
// Busca la cleaning_session por property_id + fecha; la crea si no existe.
// Llamado tanto por el endpoint PATCH como directamente desde /sivra/mensajes.
export async function registrarAvisoHuesped(opts: {
  session_id?: string
  property_id?: string
  date?: string
  type: 'early_checkout' | 'early_checkin_request' | string
  time: string
}): Promise<string | null> {
  const { session_id, property_id, date, type, time } = opts
  let sid = session_id

  if (!sid && property_id) {
    const targetDate = date || new Date().toISOString().split('T')[0]
    const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM cleaning_sessions
      WHERE property_id = ${property_id}
      AND session_date = ${targetDate}::date
      LIMIT 1
    `)

    if (existing.length > 0) {
      sid = existing[0].id
    } else {
      const created = await prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO cleaning_sessions (property_id, session_date, checkout_time, checkin_time)
        VALUES (${property_id}, ${targetDate}::date, '11:00'::time, '15:00'::time)
        RETURNING id
      `)
      sid = created[0].id
    }
  }

  if (!sid) return null

  if (type === 'early_checkout') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE cleaning_sessions SET early_checkout_time = ${time}::time
      WHERE id = ${sid}::uuid
    `)
  } else if (type === 'early_checkin_request') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE cleaning_sessions
      SET early_checkin_requested = ${time}::time, early_checkin_status = 'pending'
      WHERE id = ${sid}::uuid
    `)
  }

  return sid
}
