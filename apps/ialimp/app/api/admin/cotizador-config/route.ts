import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM cotizador_config WHERE empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!rows.length) {
      // Crear config vacía si no existe
      const created = await prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO cotizador_config (empresa_id) VALUES (${empresa_id}::uuid)
        ON CONFLICT (empresa_id) DO UPDATE SET updated_at = now()
        RETURNING *
      `)
      return NextResponse.json(serialize({ config: created[0] }))
    }
    return NextResponse.json(serialize({ config: rows[0] }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { servicios, incrementos, frecuencias, recargos, titulo, subtitulo } = await req.json()

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cotizador_config (empresa_id, servicios, incrementos, frecuencias, recargos, titulo, subtitulo)
      VALUES (
        ${empresa_id}::uuid,
        ${JSON.stringify(servicios)}::jsonb,
        ${JSON.stringify(incrementos)}::jsonb,
        ${JSON.stringify(frecuencias)}::jsonb,
        ${JSON.stringify(recargos)}::jsonb,
        ${titulo || 'Calcula tu presupuesto'},
        ${subtitulo || 'Gratis y sin compromiso'}
      )
      ON CONFLICT (empresa_id) DO UPDATE SET
        servicios   = EXCLUDED.servicios,
        incrementos = EXCLUDED.incrementos,
        frecuencias = EXCLUDED.frecuencias,
        recargos    = EXCLUDED.recargos,
        titulo      = EXCLUDED.titulo,
        subtitulo   = EXCLUDED.subtitulo,
        updated_at  = now()
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
