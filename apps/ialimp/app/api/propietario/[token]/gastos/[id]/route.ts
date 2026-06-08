import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, empresa_id::text FROM clientes
    WHERE access_token = ${token} AND notif_activa = true LIMIT 1
  `)
  return rows[0] || null
}

// PATCH — editar gasto
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const {
      nombre, importe, periodicidad, fecha_inicio, fecha_vencimiento,
      proveedor, numero_poliza, es_ingreso, notas, alerta_dias
    } = body

    await prisma.$executeRaw(Prisma.sql`
      UPDATE propietario_gastos SET
        nombre            = COALESCE(${nombre}, nombre),
        importe           = COALESCE(${importe ? Number(importe) : null}, importe),
        periodicidad      = COALESCE(${periodicidad}, periodicidad),
        fecha_inicio      = COALESCE(${fecha_inicio || null}, fecha_inicio),
        fecha_vencimiento = COALESCE(${fecha_vencimiento || null}, fecha_vencimiento),
        fecha_proximo_cargo = COALESCE(${fecha_vencimiento || null}, fecha_proximo_cargo),
        proveedor         = COALESCE(${proveedor}, proveedor),
        numero_poliza     = COALESCE(${numero_poliza}, numero_poliza),
        notas             = COALESCE(${notas}, notas),
        alerta_dias       = COALESCE(${alerta_dias ? Number(alerta_dias) : null}, alerta_dias),
        alerta_enviada    = false,
        updated_at        = NOW()
      WHERE id = ${id}::uuid AND cliente_id = ${cliente.id}::uuid AND empresa_id = ${cliente.empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — desactivar gasto
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    await prisma.$executeRaw(Prisma.sql`
      UPDATE propietario_gastos SET activo = false, updated_at = NOW()
      WHERE id = ${id}::uuid AND cliente_id = ${cliente.id}::uuid AND empresa_id = ${cliente.empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
