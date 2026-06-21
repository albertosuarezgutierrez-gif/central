import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')
  const session_id = searchParams.get('session_id')

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM cleaning_notes
    WHERE (${property_id}::text IS NULL OR property_id = ${property_id})
    AND   (${session_id}::text IS NULL OR session_id = ${session_id}::uuid)
    ORDER BY created_at DESC LIMIT 20
  `)
  return NextResponse.json({ notas: rows })
}

export async function POST(req: Request) {
  const { property_id, session_id, nota } = await req.json()
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO cleaning_notes (property_id, session_id, nota)
    VALUES (${property_id}, ${session_id || null}::uuid, ${nota})
    RETURNING *
  `)
  return NextResponse.json({ nota: row[0] })
}

export async function PATCH(req: Request) {
  const { id } = await req.json()
  await prisma.$queryRaw(Prisma.sql`UPDATE cleaning_notes SET leida = true WHERE id = ${id}::uuid`)
  return NextResponse.json({ ok: true })
}
