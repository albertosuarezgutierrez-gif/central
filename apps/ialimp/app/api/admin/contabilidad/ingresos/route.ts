import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { calcularCuotaIva, calcularTotal } from '@iarest/module-contabilidad'

// GET /api/admin/contabilidad/ingresos?year=2026
// Lista los ingresos manuales de la empresa (otros ingresos no facturados).
// Se usa en la pestaña "Ingresos" de /admin/contabilidad.
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        im.id::text,
        im.concepto,
        im.categoria,
        im.fecha::text          AS fecha,
        im.base_imponible::float,
        im.porcentaje_iva::float,
        im.cuota_iva::float,
        im.total::float,
        im.cobrado,
        im.fecha_cobro::text,
        im.notas,
        im.documento_url,
        im.recurrente_origen::text,
        im.propiedad_id::text,
        p.nombre AS propiedad_nombre,
        im.created_at::text
      FROM ingresos_manuales im
      LEFT JOIN propiedades p ON p.id = im.propiedad_id
      WHERE im.empresa_id = ${empresa_id}::uuid
        AND im.activo = true
        AND EXTRACT(YEAR FROM im.fecha) = ${year}
      ORDER BY im.fecha DESC, im.created_at DESC
      LIMIT 300
    `)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/contabilidad/ingresos
// Crea un ingreso manual en ingresos_manuales. Alimenta directamente las
// pestañas Resultado, IVA y Tesorería (vía la vista v_contab_ingresos).
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const {
      concepto, fecha, categoria,
      base_imponible, porcentaje_iva, cuota_iva, total,
      cobrado, notas, propiedad_id,
    } = body

    const base = Number(base_imponible)
    if (!fecha) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 })
    if (!Number.isFinite(base) || base <= 0) {
      return NextResponse.json({ error: 'La base imponible debe ser mayor que 0' }, { status: 400 })
    }
    if (!concepto) {
      return NextResponse.json({ error: 'Indica un concepto' }, { status: 400 })
    }

    // Cálculo de IVA y total (se respeta lo que llegue, si no se calcula con el módulo compartido)
    const pct   = porcentaje_iva != null && porcentaje_iva !== '' ? Number(porcentaje_iva) : 21
    const cuota = cuota_iva != null && cuota_iva !== '' ? Number(cuota_iva) : calcularCuotaIva(base, pct)
    const tot   = total != null && total !== '' ? Number(total) : calcularTotal(base, cuota)

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO ingresos_manuales (
        empresa_id, propiedad_id, concepto, categoria, fecha,
        base_imponible, porcentaje_iva, cuota_iva, total,
        cobrado, fecha_cobro, notas
      ) VALUES (
        ${empresa_id}::uuid,
        ${propiedad_id || null}::uuid,
        ${concepto},
        ${categoria || 'otros'},
        ${fecha}::date,
        ${base},
        ${pct},
        ${cuota},
        ${tot},
        ${cobrado === true},
        ${cobrado === true ? fecha : null}::date,
        ${notas || null}
      )
      RETURNING id::text
    `)

    return NextResponse.json({ ok: true, id: rows[0]?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
