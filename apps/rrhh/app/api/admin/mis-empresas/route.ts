import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'

export async function GET() {
  let s
  try { s = await getSesion() } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: 'No autenticado' }, { status: 401 }); throw e }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT e.id, e.nombre, e.logo_path
    FROM rrhh.empresas e
    JOIN rrhh.usuario_empresas ue ON ue.empresa_id = e.id
    WHERE ue.usuario_id = ${s.usuario_id}::uuid
    ORDER BY e.nombre ASC`)

  return NextResponse.json({ empresas: rows, empresa_actual: s.empresa_id })
}
