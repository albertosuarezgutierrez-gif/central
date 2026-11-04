import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { operadorAutorizado } from '@/lib/operador'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PUT { empresa_id, taller_id | null } — el OPERADOR (RRHH_OPERADOR_SECRET) habilita (o quita con null) el fichaje desde UN taller para esa
// empresa (`empresas.fichaje_taller_id`, migración 0030). No lo puede hacer el secreto de fichaje del taller ni nadie desde Ajustes.
export async function PUT(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const empresa = typeof b?.empresa_id === 'string' ? b.empresa_id.trim().toLowerCase() : ''
  const taller = b?.taller_id === null ? null : typeof b?.taller_id === 'string' ? b.taller_id.trim().toLowerCase() : undefined
  if (!UUID.test(empresa) || taller === undefined || (taller !== null && !UUID.test(taller))) {
    return NextResponse.json({ error: 'Faltan empresa_id (uuid) y taller_id (uuid o null)' }, { status: 400 })
  }
  const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE rrhh.empresas SET fichaje_taller_id = ${taller}::uuid WHERE id = ${empresa}::uuid RETURNING id::text AS id`)
  if (filas.length === 0) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true, empresa_id: empresa, taller_id: taller })
}
