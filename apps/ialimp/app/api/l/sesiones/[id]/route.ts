import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

async function getLimpiadoraId(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT limpiadora_id::text FROM limpiadora_sessions WHERE token::text = ${token} LIMIT 1
  `)
  return rows[0]?.limpiadora_id || null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limpiadora_id = await getLimpiadoraId()
    if (!limpiadora_id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await params
    const { accion, checklist_data, incidencias } = await req.json()

    if (accion === 'fichar_entrada') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET started_at = NOW()
        WHERE id = ${id}::uuid AND limpiadora_id = ${limpiadora_id}::uuid AND started_at IS NULL
      `)
    } else if (accion === 'completar') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET completed_at = NOW(),
          checklist_data = COALESCE(${checklist_data ? JSON.stringify(checklist_data) : null}::jsonb, checklist_data)
        WHERE id = ${id}::uuid AND limpiadora_id = ${limpiadora_id}::uuid
      `)
    } else if (accion === 'checklist') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET checklist_data = ${JSON.stringify(checklist_data)}::jsonb
        WHERE id = ${id}::uuid AND limpiadora_id = ${limpiadora_id}::uuid
      `)
    } else if (accion === 'incidencia') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions SET incidencias = ${JSON.stringify(incidencias)}::jsonb
        WHERE id = ${id}::uuid AND limpiadora_id = ${limpiadora_id}::uuid
      `)
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM sesiones_limpiadora WHERE id = ${id}::uuid AND limpiadora_id = ${limpiadora_id}::uuid
    `)
    return NextResponse.json(serialize({ ok: true, sesion: result[0] }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
