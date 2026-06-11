import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Marca un anuncio del radar como visto (scope empresa_id).

export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE concursos_radar_anuncios SET visto = true
    WHERE id = ${String(b.id)}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
