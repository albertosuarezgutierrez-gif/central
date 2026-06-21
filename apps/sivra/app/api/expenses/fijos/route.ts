// CRUD de plantillas de gastos fijos mensuales. Protegido por el middleware
// (requiere sesión NextAuth de admin). La imputación automática vive en
// /api/expenses/fijos/generar (cron del día 1).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { listarGastosFijos } from '@/lib/agente-facturas/gastos-fijos'
import { fingerprint } from '@/lib/agente-facturas/fingerprint'

export const dynamic = 'force-dynamic'

function n(v: unknown): number | null {
  if (v === '' || v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export async function GET() {
  try {
    return NextResponse.json({ fijos: await listarGastosFijos(false) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.concepto || n(b.total) == null) {
      return NextResponse.json({ error: 'Concepto e importe total son obligatorios' }, { status: 400 })
    }
    const dia = Math.min(Math.max(parseInt(b.dia_mes) || 1, 1), 28)
    const fp = fingerprint({ nif_proveedor: b.nif_proveedor, proveedor: b.proveedor, concepto: b.concepto }) || null
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO gastos_fijos
        (concepto, proveedor, nif_proveedor, categoria, propiedad,
         base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
         dia_mes, activo, notas, fingerprint, origen)
      VALUES
        (${b.concepto}, ${b.proveedor || null}, ${b.nif_proveedor || null},
         ${b.categoria || 'OTRO'}, ${b.propiedad || null},
         ${n(b.base_imponible)}, ${n(b.iva)}, ${n(b.iva_porcentaje)},
         ${n(b.irpf)}, ${n(b.irpf_porcentaje)}, ${n(b.total)},
         ${dia}, ${b.activo !== false}, ${b.notas || null}, ${fp}, 'manual')
      ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO NOTHING
      RETURNING id
    `)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Ya existe un gasto fijo para ese proveedor/concepto' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, id: rows[0]?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const dia = Math.min(Math.max(parseInt(b.dia_mes) || 1, 1), 28)
    const fp = fingerprint({ nif_proveedor: b.nif_proveedor, proveedor: b.proveedor, concepto: b.concepto }) || null
    await prisma.$executeRaw(Prisma.sql`
      UPDATE gastos_fijos SET
        concepto = ${b.concepto},
        proveedor = ${b.proveedor || null},
        nif_proveedor = ${b.nif_proveedor || null},
        categoria = ${b.categoria || 'OTRO'},
        propiedad = ${b.propiedad || null},
        base_imponible = ${n(b.base_imponible)},
        iva = ${n(b.iva)},
        iva_porcentaje = ${n(b.iva_porcentaje)},
        irpf = ${n(b.irpf)},
        irpf_porcentaje = ${n(b.irpf_porcentaje)},
        total = ${n(b.total)},
        dia_mes = ${dia},
        activo = ${b.activo !== false},
        notas = ${b.notas || null},
        fingerprint = ${fp},
        updated_at = now()
      WHERE id = ${b.id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`DELETE FROM gastos_fijos WHERE id = ${id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
