import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const body = await req.json()

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE propiedades SET
        nombre                = COALESCE(${body.nombre                ?? null}, nombre),
        tipo                  = COALESCE(${body.tipo                  ?? null}, tipo),
        direccion             = COALESCE(${body.direccion             ?? null}, direccion),
        via                   = COALESCE(${body.via                   ?? null}, via),
        numero                = COALESCE(${body.numero                ?? null}, numero),
        piso                  = COALESCE(${body.piso                  ?? null}, piso),
        puerta                = COALESCE(${body.puerta                ?? null}, puerta),
        codigo_postal         = COALESCE(${body.codigo_postal         ?? null}, codigo_postal),
        municipio             = COALESCE(${body.municipio             ?? null}, municipio),
        provincia             = COALESCE(${body.provincia             ?? null}, provincia),
        referencia_catastral  = COALESCE(${body.referencia_catastral  ?? null}, referencia_catastral),
        modelo_precio         = COALESCE(${body.modelo_precio         ?? null}, modelo_precio),
        precio_limpieza       = COALESCE(${body.precio_limpieza       ?? null}::numeric, precio_limpieza),
        duracion_estimada_min = COALESCE(${body.duracion_estimada_min ?? null}::int, duracion_estimada_min),
        hora_checkout_habitual= COALESCE(${body.hora_checkout_habitual?? null}, hora_checkout_habitual),
        hora_checkin_habitual = COALESCE(${body.hora_checkin_habitual ?? null}, hora_checkin_habitual),
        notas_material        = COALESCE(${body.notas_material        ?? null}, notas_material),
        activa                = COALESCE(${body.activa                ?? null}, activa),
        m2                    = COALESCE(${body.m2                    ?? null}::numeric, m2),
        habitaciones          = COALESCE(${body.habitaciones          ?? null}::int, habitaciones),
        pms_propiedad_id      = COALESCE(${body.pms_propiedad_id      ?? null}, pms_propiedad_id),
        ical_urls             = COALESCE(${body.ical_urls             ?? null}::text[], ical_urls),
        limpiadora_principal_id = COALESCE(${body.limpiadora_principal_id ?? null}::uuid, limpiadora_principal_id),
        notas                 = COALESCE(${body.notas                 ?? null}, notas),
        lavanderia_proveedor  = COALESCE(${body.lavanderia_proveedor  ?? null}, lavanderia_proveedor),
        material_override     = COALESCE(${body.material_override     != null ? JSON.stringify(body.material_override) : null}::jsonb, material_override)
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING *
    `)
    return NextResponse.json(serialize({ ok: true, propiedad: result[0] }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`
      UPDATE propiedades SET activa = false
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
