import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET — catálogo de tarifas de la empresa (precios y tiempos por piso/servicio)
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const q   = (searchParams.get('q') || '').trim()
    const cat = searchParams.get('categoria')
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre, categoria, tiempo_min, precio, precio_cliente,
             propiedad_id::text, activo
      FROM catalogo_tarifas
      WHERE empresa_id = ${empresa_id}::uuid
        ${cat ? Prisma.sql`AND categoria = ${cat}` : Prisma.sql``}
        ${q ? Prisma.sql`AND nombre ILIKE ${'%' + q + '%'}` : Prisma.sql``}
      ORDER BY activo DESC, nombre
    `)
    return NextResponse.json(serialize({ tarifas: rows }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear/actualizar concepto (upsert por nombre dentro de la empresa)
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    if (!b.nombre?.trim()) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO catalogo_tarifas (empresa_id, nombre, categoria, tiempo_min, precio, precio_cliente, propiedad_id)
      VALUES (${empresa_id}::uuid, ${b.nombre.trim()}, ${b.categoria || 'piso'},
              ${b.tiempo_min != null && b.tiempo_min !== '' ? Number(b.tiempo_min) : null},
              ${b.precio != null && b.precio !== '' ? Number(b.precio) : null},
              ${b.precio_cliente != null && b.precio_cliente !== '' ? Number(b.precio_cliente) : null},
              ${b.propiedad_id ? b.propiedad_id : null}::uuid)
      ON CONFLICT (empresa_id, lower(nombre)) DO UPDATE SET
        categoria      = EXCLUDED.categoria,
        tiempo_min     = EXCLUDED.tiempo_min,
        precio         = EXCLUDED.precio,
        precio_cliente = EXCLUDED.precio_cliente,
        propiedad_id   = EXCLUDED.propiedad_id,
        activo         = true,
        updated_at     = now()
      RETURNING id::text, nombre, categoria, tiempo_min, precio, precio_cliente, propiedad_id::text, activo
    `)
    return NextResponse.json(serialize({ tarifa: row[0] }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — editar un campo concreto (no pisa lo no enviado)
export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const id = String(b.id)
    const scope = Prisma.sql`WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`
    if (b.nombre !== undefined && b.nombre.trim())
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET nombre=${b.nombre.trim()}, updated_at=now() ${scope}`)
    if (b.categoria !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET categoria=${b.categoria}, updated_at=now() ${scope}`)
    if (b.tiempo_min !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET tiempo_min=${b.tiempo_min === '' || b.tiempo_min === null ? null : Number(b.tiempo_min)}, updated_at=now() ${scope}`)
    if (b.precio !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET precio=${b.precio === '' || b.precio === null ? null : Number(b.precio)}, updated_at=now() ${scope}`)
    if (b.precio_cliente !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET precio_cliente=${b.precio_cliente === '' || b.precio_cliente === null ? null : Number(b.precio_cliente)}, updated_at=now() ${scope}`)
    if (b.activo !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE catalogo_tarifas SET activo=${Boolean(b.activo)}, updated_at=now() ${scope}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — borrar concepto (los partes que lo referencian quedan con catalogo_id NULL)
export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM catalogo_tarifas WHERE id=${String(id)}::uuid AND empresa_id=${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
