import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    // Por defecto solo clientes ACTIVOS (selectores de Nueva limpieza, agenda, informes,
    // facturas, negocio). La página de gestión de clientes pasa ?incluir_inactivos=1.
    const incluirInactivos = new URL(req.url).searchParams.get('incluir_inactivos') === '1'
    const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.*, COUNT(DISTINCT p.id)::int AS num_propiedades
      FROM clientes c LEFT JOIN propiedades p ON p.cliente_id = c.id
      WHERE c.empresa_id = ${empresa_id}::uuid
        ${incluirInactivos ? Prisma.sql`` : Prisma.sql`AND c.activo = true`}
      GROUP BY c.id ORDER BY c.activo DESC, c.nombre
    `)
    return NextResponse.json({ clientes })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

// POST — alta manual de cliente
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { nombre, contacto_nombre, contacto_tel, contacto_email, direccion, notas } = await req.json()

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO clientes (
        empresa_id, nombre, tipo,
        contacto_nombre, contacto_tel, contacto_email, direccion, notas
      ) VALUES (
        ${empresa_id}::uuid,
        ${nombre.trim()},
        'apartamentos_turisticos',
        ${contacto_nombre?.trim() || null},
        ${contacto_tel?.trim() || null},
        ${contacto_email?.trim() || null},
        ${direccion?.trim() || null},
        ${notas?.trim() || null}
      )
      RETURNING *, 0::int AS num_propiedades
    `)
    return NextResponse.json({ cliente: result[0] }, { status: 201 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
