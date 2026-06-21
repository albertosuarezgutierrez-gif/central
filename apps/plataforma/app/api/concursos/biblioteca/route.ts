import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Biblioteca de empresa (F2 del módulo de concursos). Mismo patrón de auth/scope
// que app/api/admin/concursos/analizar/route.ts: empresa_id de la sesión vía
// requireEmpresaId() + persistencia con Prisma raw SQL (Prisma.sql) scopeada.

// GET — lista los documentos de la biblioteca de la empresa.
export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, tipo, nombre, vigencia_hasta, datos, creado_en
    FROM biblioteca_documentos
    WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY creado_en DESC
    LIMIT 200
  `)
  return NextResponse.json({ documentos: rows })
}

// POST — alta de un documento { tipo, nombre, vigencia_hasta?, datos? }.
export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  if (!body?.tipo || !body?.nombre) {
    return NextResponse.json({ error: 'tipo y nombre son obligatorios' }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO biblioteca_documentos (empresa_id, tipo, nombre, vigencia_hasta, datos)
    VALUES (
      ${empresa_id}::uuid,
      ${String(body.tipo)},
      ${String(body.nombre)},
      ${body.vigencia_hasta ?? null}::date,
      ${JSON.stringify(body.datos ?? {})}::jsonb
    )
    RETURNING id, tipo, nombre, vigencia_hasta, datos, creado_en
  `)
  return NextResponse.json({ documento: rows[0] })
}
