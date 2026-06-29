import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { operadorAutorizado } from '@/lib/operador'

// GET — puerto operador READ-ONLY: empleados de todas las empresas rrhh con su persona_id,
// para que `plataforma` consolide "la persona a través de verticales" (Fase 3). No expone
// documentos ni datos sensibles, solo lo mínimo para enlazar identidades.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const personas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT e.id::text          AS empleado_id,
           e.persona_id::text  AS persona_id,
           e.nombre, e.email, e.dni, e.estado,
           e.empresa_id::text  AS empresa_id,
           emp.nombre          AS empresa_nombre
    FROM rrhh.empleados e JOIN rrhh.empresas emp ON emp.id = e.empresa_id
    ORDER BY e.nombre ASC`)
  return NextResponse.json({ personas: JSON.parse(JSON.stringify(personas)) })
}
