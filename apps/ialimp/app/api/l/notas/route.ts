import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

export async function GET(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')
  const session_id = searchParams.get('session_id')

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM cleaning_notes
    WHERE (${property_id}::text IS NULL OR property_id = ${property_id})
    AND   (${session_id}::text IS NULL OR session_id = ${session_id}::uuid)
    AND   (property_id IN (SELECT DISTINCT property_id FROM cleaning_sessions WHERE empresa_id = ${sess.empresa_id}::uuid)
           OR session_id IN (SELECT id FROM cleaning_sessions WHERE empresa_id = ${sess.empresa_id}::uuid))
    ORDER BY created_at DESC LIMIT 20
  `)
  return NextResponse.json({ notas: rows })
}

export async function POST(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { property_id, session_id, nota } = await req.json()
  // La sesión/piso debe ser de la empresa de la limpiadora.
  const owns = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM cleaning_sessions
    WHERE empresa_id = ${sess.empresa_id}::uuid
      AND (id = ${session_id || null}::uuid OR property_id = ${property_id})
    LIMIT 1
  `)
  if (!owns.length) return NextResponse.json({ error: 'No válido' }, { status: 403 })
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO cleaning_notes (property_id, session_id, nota)
    VALUES (${property_id}, ${session_id || null}::uuid, ${nota})
    RETURNING *
  `)
  return NextResponse.json({ nota: row[0] })
}

export async function PATCH(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE cleaning_notes SET leida = true
    WHERE id = ${id}::uuid
      AND (property_id IN (SELECT DISTINCT property_id FROM cleaning_sessions WHERE empresa_id = ${sess.empresa_id}::uuid)
           OR session_id IN (SELECT id FROM cleaning_sessions WHERE empresa_id = ${sess.empresa_id}::uuid))
  `)
  return NextResponse.json({ ok: true })
}
