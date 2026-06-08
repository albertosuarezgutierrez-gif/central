import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { generarRecurrentes } from '@/lib/contab-recurrentes'

// GET /api/admin/contabilidad/recurrentes
// Lista las plantillas de apuntes recurrentes activas de la empresa.
export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        r.id::text, r.tipo, r.proveedor, r.concepto, r.categoria,
        r.base_imponible::float, r.porcentaje_iva::float,
        r.periodicidad, r.fecha_inicio::text, r.fecha_fin::text,
        r.ultima_generada::text, r.propiedad_id::text,
        p.nombre AS propiedad_nombre
      FROM apuntes_recurrentes r
      LEFT JOIN propiedades p ON p.id = r.propiedad_id
      WHERE r.empresa_id = ${empresa_id}::uuid
        AND r.activo = true
      ORDER BY r.created_at DESC
    `)
    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/contabilidad/recurrentes
// Crea una plantilla recurrente (gasto o ingreso). El cron genera el apunte real
// de cada periodo; aquí además materializamos de inmediato el periodo en curso para
// que el usuario lo vea ya en la lista.
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const {
      tipo, proveedor, concepto, categoria,
      base_imponible, porcentaje_iva,
      periodicidad, fecha_inicio, fecha_fin, propiedad_id,
    } = body

    const t = tipo === 'ingreso' ? 'ingreso' : 'gasto'
    const base = Number(base_imponible)
    const per = ['mensual', 'trimestral', 'semestral', 'anual'].includes(periodicidad) ? periodicidad : 'mensual'

    if (!fecha_inicio) return NextResponse.json({ error: 'La fecha de inicio es obligatoria' }, { status: 400 })
    if (!Number.isFinite(base) || base <= 0) {
      return NextResponse.json({ error: 'La base imponible debe ser mayor que 0' }, { status: 400 })
    }
    if (t === 'ingreso' ? !concepto : (!proveedor && !concepto)) {
      return NextResponse.json({ error: t === 'ingreso' ? 'Indica un concepto' : 'Indica un proveedor o un concepto' }, { status: 400 })
    }

    const pct = porcentaje_iva != null && porcentaje_iva !== '' ? Number(porcentaje_iva) : 21

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO apuntes_recurrentes (
        empresa_id, tipo, propiedad_id, proveedor, concepto, categoria,
        base_imponible, porcentaje_iva, periodicidad, fecha_inicio, fecha_fin
      ) VALUES (
        ${empresa_id}::uuid, ${t}, ${propiedad_id || null}::uuid,
        ${proveedor || null}, ${concepto || proveedor || 'Apunte recurrente'},
        ${categoria || 'otros'}, ${base}, ${pct}, ${per},
        ${fecha_inicio}::date, ${fecha_fin || null}::date
      )
      RETURNING id::text
    `)

    // Materializa de inmediato los periodos ya vencidos (desde fecha_inicio hasta hoy)
    // para que el apunte se vea ya; el cron diario seguirá generando los siguientes.
    if (rows[0]?.id) await generarRecurrentes(rows[0].id)

    return NextResponse.json({ ok: true, id: rows[0]?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
