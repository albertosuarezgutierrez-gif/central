
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// PATCH — actualizar chat_config de un cliente (empresa controla permisos del propietario)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const body = await req.json()

    const allowed = [
      'default_visible_limpiadora',
      'limpiadora_puede_responder',
      'ver_checklist',
      'ver_fotos',
    ]
    const patch: Record<string, any> = {}
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') patch[key] = body[key]
    }
    if (!Object.keys(patch).length)
      return NextResponse.json({ error: 'Sin cambios válidos' }, { status: 400 })

    // Verificar que el cliente pertenece a esta empresa
    const check = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM clientes WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!check.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    await prisma.$executeRaw(Prisma.sql`
      UPDATE clientes
      SET chat_config = COALESCE(chat_config, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
          updated_at  = now()
      WHERE id = ${id}::uuid
    `)
    return NextResponse.json({ ok: true, patch })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET — obtener config actual
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre,
             COALESCE(chat_config, '{"default_visible_limpiadora":false,"limpiadora_puede_responder":false,"ver_checklist":false,"ver_fotos":false}'::jsonb) AS chat_config
      FROM clientes WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
