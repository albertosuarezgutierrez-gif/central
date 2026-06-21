import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const expedientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ex.id::text, ex.tipo, ex.titulo, ex.descripcion,
             ex.creada_at::text, ex.periodo, ex.generado_por_ia,
             l.nombre AS limpiadora_nombre
      FROM expedientes_rrhh ex
      LEFT JOIN limpiadoras l ON l.id = ex.limpiadora_id
      WHERE ex.empresa_id = ${empresa_id}::uuid
      ORDER BY ex.creada_at DESC
    `)
    return NextResponse.json({ expedientes })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { limpiadora_id, tipo, titulo, descripcion } = await req.json()
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO expedientes_rrhh (empresa_id, limpiadora_id, tipo, titulo, descripcion)
      VALUES (${empresa_id}::uuid, ${limpiadora_id}::uuid, ${tipo}, ${titulo || tipo}, ${descripcion})
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
