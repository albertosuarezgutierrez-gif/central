import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getAdmin } from '@/lib/superadmin'
import { prisma } from '@/lib/db'

// GET /api/admin/actividad — historial paginado del registro de actividad de
// ialimp para el god-panel (/operador/actividad). Solo lectura, solo superadmin.
export const dynamic = 'force-dynamic'

const LIMITE = 50

export async function GET(req: Request) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const empresa = url.searchParams.get('empresa') || ''
  const tipo = url.searchParams.get('tipo') || ''
  const accion = url.searchParams.get('accion') || ''
  const q = url.searchParams.get('q')?.trim() || ''
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)

  const conds = [Prisma.sql`1 = 1`]
  if (empresa) conds.push(Prisma.sql`r.empresa_id = ${empresa}::uuid`)
  if (tipo) conds.push(Prisma.sql`r.actor_tipo = ${tipo}`)
  if (accion === 'login') conds.push(Prisma.sql`r.accion IN ('login', 'login_forzado')`)
  else if (accion) conds.push(Prisma.sql`r.accion = ${accion}`)
  if (q) conds.push(Prisma.sql`(r.actor_nombre ILIKE ${'%' + q + '%'} OR r.ruta ILIKE ${'%' + q + '%'})`)

  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id::text AS id, r.empresa_id::text AS empresa_id, e.nombre AS empresa_nombre,
           r.actor_tipo, r.actor_nombre, r.accion, r.metodo, r.ruta, r.detalle, r.ip,
           r.created_at::text AS created_at
    FROM registro_actividad r
    LEFT JOIN empresas e ON e.id = r.empresa_id
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY r.created_at DESC
    LIMIT ${LIMITE + 1} OFFSET ${offset}
  `)

  return NextResponse.json({ filas: filas.slice(0, LIMITE), hayMas: filas.length > LIMITE })
}
