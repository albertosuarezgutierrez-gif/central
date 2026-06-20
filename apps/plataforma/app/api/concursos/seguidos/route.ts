import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// "Mis concursos" — seguir/gestionar licitaciones. Scope `empresa_id`.
const ESTADOS = ['interesado', 'preparando', 'presentado', 'adjudicado', 'perdido']

export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, dedupe_key, licitacion, estado, notas, fin_presentacion, creado_en
    FROM concursos_seguidos WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY fin_presentacion ASC NULLS LAST, creado_en DESC
  `)
  return NextResponse.json({ seguidos: rows })
}

export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const key = String(b?.dedupe_key || '').trim()
  const lic = b?.licitacion
  if (!key || !lic) return NextResponse.json({ error: 'Falta dedupe_key o licitacion' }, { status: 400 })
  const fin = lic?.fin_presentacion || null
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO concursos_seguidos (empresa_id, dedupe_key, licitacion, fin_presentacion)
    VALUES (${empresa_id}::uuid, ${key}, ${JSON.stringify(lic)}::jsonb, ${fin}::date)
    ON CONFLICT (empresa_id, dedupe_key) DO UPDATE SET
      licitacion = EXCLUDED.licitacion, fin_presentacion = EXCLUDED.fin_presentacion, actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const key = String(b?.dedupe_key || '').trim()
  if (!key) return NextResponse.json({ error: 'Falta dedupe_key' }, { status: 400 })
  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`UPDATE concursos_seguidos SET estado = ${b.estado}, actualizado_en = now()
      WHERE empresa_id = ${empresa_id}::uuid AND dedupe_key = ${key}`)
  }
  if (b.notas !== undefined) {
    await prisma.$executeRaw(Prisma.sql`UPDATE concursos_seguidos SET notas = ${b.notas || null}, actualizado_en = now()
      WHERE empresa_id = ${empresa_id}::uuid AND dedupe_key = ${key}`)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const key = (new URL(req.url).searchParams.get('dedupe_key') || '').trim()
  if (!key) return NextResponse.json({ error: 'Falta dedupe_key' }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`DELETE FROM concursos_seguidos
    WHERE empresa_id = ${empresa_id}::uuid AND dedupe_key = ${key}`)
  return NextResponse.json({ ok: true })
}
