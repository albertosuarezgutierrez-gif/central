import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET — devuelve los datos de oferta guardados (o null).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT oferta FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  return NextResponse.json({ oferta: rows[0].oferta ?? null })
}

// PUT — guarda los datos de entrada de la oferta { directos, indirectos?, margen_objetivo_pct?, oferta?, ofertas_competencia? }.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const r = await prisma.$queryRaw<any[]>(Prisma.sql`
    UPDATE concursos SET oferta = ${JSON.stringify(body ?? {})}::jsonb
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    RETURNING oferta
  `)
  if (!r[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, oferta: r[0].oferta })
}
