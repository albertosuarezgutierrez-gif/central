import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET /api/admin/contabilidad/apuntes?year=2026
// Lista los apuntes contables (gastos) de la empresa: tanto escaneados como
// añadidos a mano. Se usa para mostrar/gestionar los movimientos en la pestaña
// "Apuntes" de /admin/contabilidad.
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        dc.id::text,
        dc.tipo_doc,
        dc.proveedor,
        dc.fecha_doc::text   AS fecha,
        dc.numero_doc,
        dc.categoria,
        dc.descripcion,
        dc.base_imponible::float,
        dc.porcentaje_iva::float,
        dc.cuota_iva::float,
        dc.total::float,
        dc.pagado,
        dc.notas,
        dc.documento_url,
        dc.recurrente_origen::text,
        dc.propiedad_id::text,
        p.nombre AS propiedad_nombre,
        dc.created_at::text
      FROM documentos_contables dc
      LEFT JOIN propiedades p ON p.id = dc.propiedad_id
      WHERE dc.empresa_id = ${empresa_id}::uuid
        AND dc.activo = true
        AND COALESCE(dc.ambito, 'empresa') = 'empresa'
        AND dc.tipo_doc NOT IN ('pendiente', 'error')
        AND EXTRACT(YEAR FROM dc.fecha_doc) = ${year}
      ORDER BY dc.fecha_doc DESC, dc.created_at DESC
      LIMIT 300
    `)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/contabilidad/apuntes
// Crea un apunte contable manual (gasto de la empresa) en documentos_contables.
// Alimenta directamente las pestañas Resultado, IVA, Tesorería y Rentabilidad.
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const {
      proveedor, concepto, fecha, categoria,
      base_imponible, porcentaje_iva, cuota_iva, total,
      numero_doc, pagado, notas, propiedad_id,
    } = body

    const base = Number(base_imponible)
    if (!fecha) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 })
    if (!Number.isFinite(base) || base <= 0) {
      return NextResponse.json({ error: 'La base imponible debe ser mayor que 0' }, { status: 400 })
    }
    if (!proveedor && !concepto) {
      return NextResponse.json({ error: 'Indica un proveedor o un concepto' }, { status: 400 })
    }

    // Cálculo de IVA y total (se respeta lo que llegue, si no se calcula)
    const pct   = porcentaje_iva != null && porcentaje_iva !== '' ? Number(porcentaje_iva) : 21
    const cuota = cuota_iva != null && cuota_iva !== '' ? Number(cuota_iva) : Math.round(base * pct) / 100
    const tot   = total != null && total !== '' ? Number(total) : Math.round((base + cuota) * 100) / 100

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO documentos_contables (
        empresa_id, propiedad_id, tipo_doc, ambito, activo,
        proveedor, fecha_doc, numero_doc, categoria, descripcion,
        base_imponible, porcentaje_iva, cuota_iva, total,
        pagado, fecha_pago, notas
      ) VALUES (
        ${empresa_id}::uuid,
        ${propiedad_id || null}::uuid,
        'manual',
        'empresa',
        true,
        ${proveedor || null},
        ${fecha}::date,
        ${numero_doc || null},
        ${categoria || 'otros'},
        ${concepto || proveedor || 'Apunte manual'},
        ${base},
        ${pct},
        ${cuota},
        ${tot},
        ${pagado === true},
        ${pagado === true ? fecha : null}::date,
        ${notas || null}
      )
      RETURNING id::text
    `)

    return NextResponse.json({ ok: true, id: rows[0]?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
