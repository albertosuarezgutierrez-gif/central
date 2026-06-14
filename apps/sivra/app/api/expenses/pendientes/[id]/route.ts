// Aprobar (PATCH) o descartar (DELETE) un gasto de la bandeja de revisión.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { reforzarRegla, type DatosGasto } from '@/lib/agente-facturas/imputar'
import { fingerprint } from '@/lib/agente-facturas/fingerprint'

export const dynamic = 'force-dynamic'

// Aprobar: aplica correcciones opcionales, marca revisado=true y refuerza la regla.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const campos = ['proveedor', 'nif_proveedor', 'numero_factura', 'concepto', 'categoria', 'propiedad',
      'base_imponible', 'iva', 'iva_porcentaje', 'irpf', 'irpf_porcentaje', 'total'] as const

    // Aplica correcciones que vengan en el body.
    const sets: Prisma.Sql[] = []
    for (const c of campos) {
      if (body[c] !== undefined) sets.push(Prisma.sql`${Prisma.raw(c)} = ${body[c] === '' ? null : body[c]}`)
    }
    sets.push(Prisma.sql`revisado = true`)
    sets.push(Prisma.sql`motivo_revision = NULL`)
    sets.push(Prisma.sql`updated_at = now()`)
    await prisma.$executeRaw(Prisma.sql`UPDATE gastos SET ${Prisma.join(sets, ', ')} WHERE id = ${id}::uuid`)

    // Relee el gasto y refuerza la regla aprendida.
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT fecha, proveedor, nif_proveedor, concepto, categoria, propiedad,
        base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total, fingerprint
      FROM gastos WHERE id = ${id}::uuid LIMIT 1
    `)
    if (rows[0]) {
      const g = rows[0]
      const fp = g.fingerprint || fingerprint({ nif_proveedor: g.nif_proveedor, proveedor: g.proveedor, concepto: g.concepto })
      const datos: DatosGasto = {
        fecha: typeof g.fecha === 'string' ? g.fecha : new Date(g.fecha).toISOString().slice(0, 10),
        proveedor: g.proveedor, nif_proveedor: g.nif_proveedor, numero_factura: null,
        concepto: g.concepto, categoria: g.categoria || 'OTRO', propiedad: g.propiedad,
        base_imponible: num(g.base_imponible), iva: num(g.iva), iva_porcentaje: num(g.iva_porcentaje),
        irpf: num(g.irpf), irpf_porcentaje: num(g.irpf_porcentaje), total: num(g.total) || 0,
        fingerprint: fp,
      }
      await reforzarRegla(datos)
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Descartar: borra la fila pendiente.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`DELETE FROM gastos WHERE id = ${id}::uuid AND revisado = false`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
