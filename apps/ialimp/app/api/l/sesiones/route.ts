import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

async function getLimpiadoraFromCookie() {
  const jar = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null

  // limpiadora_sessions.token puede ser UUID guardado como text
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.limpiadora_id::text, l.empresa_id::text
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token::text = ${token}
    LIMIT 1
  `)
  if (!rows.length) return null
  return { limpiadora_id: rows[0].limpiadora_id, empresa_id: rows[0].empresa_id }
}

export async function GET(req: Request) {
  try {
    const auth = await getLimpiadoraFromCookie()
    if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM sesiones_limpiadora
      WHERE limpiadora_id = ${auth.limpiadora_id}::uuid
        AND empresa_id    = ${auth.empresa_id}::uuid
        AND session_date  = ${date}::date
      ORDER BY
        (orden_manual IS NULL),                        -- orden fijado por el admin manda
        orden_manual ASC,                              -- ... en su secuencia
        (urgente_manual IS TRUE) DESC,                 -- urgentes (marcadas a mano) arriba
        (alerta_ventana IS TRUE) DESC,                 -- ventana ajustada primero
        (hora_checkin_siguiente IS NOT NULL) DESC,     -- pisos con entrada de huésped arriba
        hora_checkin_siguiente::text ASC NULLS LAST,   -- el que entra antes, primero
        COALESCE(hora_checkout::text, hora_inicio::text, hora_pactada::text) NULLS LAST
    `)

    return NextResponse.json(serialize({ sesiones, date }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
