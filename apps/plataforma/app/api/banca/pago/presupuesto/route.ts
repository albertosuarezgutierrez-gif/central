// GET  /api/banca/pago/presupuesto?proveedor=X  → presupuesto anual del proveedor
// PUT  /api/banca/pago/presupuesto              → { proveedor, budget_anual } → upsert
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await requireSession()
  const proveedor = new URL(req.url).searchParams.get('proveedor')
  if (!proveedor) return NextResponse.json({ error: 'Falta proveedor' }, { status: 400 })

  const rows = await prisma.$queryRaw<{ budget_anual: number; gastado: number }[]>(Prisma.sql`
    SELECT
      COALESCE(MAX(pp.budget_anual), 0)::float AS budget_anual,
      COALESCE(SUM(fp.importe), 0)::float AS gastado
    FROM presupuesto_proveedores pp
    FULL OUTER JOIN facturas_proveedor fp
      ON fp.cuenta_id = ${session.id}::uuid
      AND fp.proveedor = ${proveedor}
      AND EXTRACT(YEAR FROM fp.created_at) = EXTRACT(YEAR FROM NOW())
      AND fp.estado != 'rechazada'
    WHERE pp.cuenta_id = ${session.id}::uuid AND pp.proveedor = ${proveedor}
      AND pp.anno = EXTRACT(YEAR FROM NOW())::int
  `)
  return NextResponse.json(rows[0] ?? { budget_anual: 0, gastado: 0 })
}

export async function PUT(req: Request) {
  const session = await requireSession()
  const { proveedor, budget_anual } = await req.json()
  if (!proveedor || typeof budget_anual !== 'number') {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO presupuesto_proveedores (cuenta_id, proveedor, budget_anual)
    VALUES (${session.id}::uuid, ${proveedor}, ${budget_anual}::numeric)
    ON CONFLICT (cuenta_id, proveedor, anno) DO UPDATE SET budget_anual = EXCLUDED.budget_anual
  `)
  return NextResponse.json({ ok: true })
}
