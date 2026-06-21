import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET — partes de trabajo (filtrable por limpiadora y rango de fechas)
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const lid   = searchParams.get('limpiadora_id')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p.id::text, p.limpiadora_id::text, l.nombre AS limpiadora_nombre, l.color AS limpiadora_color,
             to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p.catalogo_id::text, p.session_id::text,
             p.concepto, p.tiempo_min, p.importe, p.cantidad, p.notas, p.origen,
             (p.importe * p.cantidad) AS importe_total
      FROM partes_trabajo p
      JOIN limpiadoras l ON l.id = p.limpiadora_id
      WHERE p.empresa_id = ${empresa_id}::uuid
        ${lid ? Prisma.sql`AND p.limpiadora_id = ${lid}::uuid` : Prisma.sql``}
        ${desde ? Prisma.sql`AND p.fecha >= ${desde}::date` : Prisma.sql``}
        ${hasta ? Prisma.sql`AND p.fecha <= ${hasta}::date` : Prisma.sql``}
      ORDER BY p.fecha DESC, l.nombre, p.concepto
    `)
    return NextResponse.json(serialize({ partes: rows }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — registrar un parte. Si llega catalogo_id, toma concepto/tiempo/precio
// del catálogo como valores por defecto (snapshot editable).
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    if (!b.limpiadora_id) return NextResponse.json({ error: 'Limpiadora requerida' }, { status: 400 })
    if (!b.fecha)         return NextResponse.json({ error: 'Fecha requerida' }, { status: 400 })

    let concepto  = (b.concepto || '').trim()
    let tiempo    = b.tiempo_min != null && b.tiempo_min !== '' ? Number(b.tiempo_min) : null
    let importe   = b.importe != null && b.importe !== '' ? Number(b.importe) : null

    if (b.catalogo_id) {
      const cat = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre, tiempo_min, precio FROM catalogo_tarifas
        WHERE id = ${String(b.catalogo_id)}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
      `)
      if (cat[0]) {
        if (!concepto)      concepto = cat[0].nombre
        if (tiempo === null) tiempo  = cat[0].tiempo_min
        if (importe === null) importe = cat[0].precio != null ? Number(cat[0].precio) : 0
      }
    }
    if (!concepto) return NextResponse.json({ error: 'Concepto requerido' }, { status: 400 })

    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO partes_trabajo
        (empresa_id, limpiadora_id, fecha, catalogo_id, concepto, tiempo_min, importe, cantidad, notas, origen)
      VALUES (${empresa_id}::uuid, ${String(b.limpiadora_id)}::uuid, ${b.fecha}::date,
              ${b.catalogo_id ? String(b.catalogo_id) : null}::uuid,
              ${concepto}, ${tiempo}, ${importe ?? 0},
              ${b.cantidad != null && b.cantidad !== '' ? Number(b.cantidad) : 1},
              ${b.notas || null}, 'manual')
      RETURNING id::text
    `)
    return NextResponse.json(serialize({ ok: true, id: row[0]?.id }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — editar un parte (importe, tiempo, cantidad, concepto, fecha, notas)
export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const id = String(b.id)
    const scope = Prisma.sql`WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`
    if (b.concepto !== undefined && b.concepto.trim())
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET concepto=${b.concepto.trim()} ${scope}`)
    if (b.fecha !== undefined && b.fecha)
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET fecha=${b.fecha}::date ${scope}`)
    if (b.tiempo_min !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET tiempo_min=${b.tiempo_min === '' || b.tiempo_min === null ? null : Number(b.tiempo_min)} ${scope}`)
    if (b.importe !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET importe=${Number(b.importe) || 0} ${scope}`)
    if (b.cantidad !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET cantidad=${Number(b.cantidad) || 1} ${scope}`)
    if (b.notas !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE partes_trabajo SET notas=${b.notas || null} ${scope}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — borrar un parte
export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM partes_trabajo WHERE id=${String(id)}::uuid AND empresa_id=${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
