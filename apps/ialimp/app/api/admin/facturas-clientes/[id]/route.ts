import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — detalle con líneas
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const [facturas, lineas] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT f.*, c.nombre AS cliente_nombre, c.contacto_email, c.contacto_nombre
        FROM facturas_clientes f
        JOIN clientes c ON c.id = f.cliente_id
        WHERE f.id = ${id}::uuid AND f.empresa_id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM factura_clientes_lineas
        WHERE factura_id = ${id}::uuid
        ORDER BY orden ASC, id ASC
      `)
    ])

    if (!facturas.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ factura: facturas[0], lineas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — cambiar estado / actualizar campos
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { estado, concepto, fecha_vencimiento, notas } = await req.json()

    const ESTADOS = ['borrador','emitida','pagada','vencida']
    if (estado && !ESTADOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE facturas_clientes SET
        estado            = COALESCE(${estado            ?? null}, estado),
        concepto          = COALESCE(${concepto          ?? null}, concepto),
        fecha_vencimiento = COALESCE(${fecha_vencimiento ? fecha_vencimiento + '::date' : null}, fecha_vencimiento),
        notas             = COALESCE(${notas             ?? null}, notas),
        fecha_emision     = CASE WHEN ${estado ?? ''} = 'emitida' AND fecha_emision IS NULL
                              THEN CURRENT_DATE ELSE fecha_emision END
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING *
    `)

    if (!result.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, factura: result[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — solo borradores
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const check = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, estado FROM facturas_clientes
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (!check.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    if (check[0].estado !== 'borrador') {
      return NextResponse.json({ error: 'Solo se pueden eliminar borradores' }, { status: 409 })
    }

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM facturas_clientes WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
