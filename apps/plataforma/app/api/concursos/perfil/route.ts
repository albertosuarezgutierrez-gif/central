import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Perfil de identificación de la empresa para el DEUC (F3). Scope empresa_id.

export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ perfil: rows[0] ?? null })
}

export async function PUT(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO concursos_perfil_empresa
      (empresa_id, razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme, actualizado_en)
    VALUES (
      ${empresa_id}::uuid, ${String(b.razon_social ?? '')}, ${String(b.nif ?? '')},
      ${b.domicilio ?? null}, ${b.representante ?? null}, ${b.representante_dni ?? null},
      ${b.email ?? null}, ${b.telefono ?? null}, ${b.es_pyme !== false}, now()
    )
    ON CONFLICT (empresa_id) DO UPDATE SET
      razon_social = EXCLUDED.razon_social, nif = EXCLUDED.nif, domicilio = EXCLUDED.domicilio,
      representante = EXCLUDED.representante, representante_dni = EXCLUDED.representante_dni,
      email = EXCLUDED.email, telefono = EXCLUDED.telefono, es_pyme = EXCLUDED.es_pyme,
      actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}
