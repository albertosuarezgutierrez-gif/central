import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Desglose de un cargo entre varios pisos (reparto por porcentaje). El reparto NO cambia la
// deducibilidad fiscal del cargo (sigue contando entero como turistico_pisos); solo alimenta el
// P&L de cada piso (/apartamentos/[id]). Caso de uso: lavandería/suministros que facturan en bloque.

type RepartoIn = { propiedad: string; porcentaje: number }

// POST { movimientoId, repartos: [{propiedad, porcentaje}] }
//  - repartos vacío  → borra el desglose (vuelve a contar como cargo único en su bucket).
//  - repartos no vacío → valida suma ≈ 100, recalcula importes y reemplaza el desglose.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { movimientoId?: string; repartos?: RepartoIn[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const movimientoId = body.movimientoId
  const repartos = Array.isArray(body.repartos) ? body.repartos : []
  if (!movimientoId) return NextResponse.json({ error: 'Falta movimientoId' }, { status: 400 })

  // El movimiento debe ser de la cuenta del usuario (scope multi-tenant).
  const movRows = await prisma.$queryRaw<Array<{ importe: unknown }>>`
    SELECT mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${movimientoId}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!movRows[0]) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
  const totalAbs = Math.abs(Number(movRows[0].importe))

  // Sin repartos → limpiar desglose.
  if (repartos.length === 0) {
    await prisma.$executeRaw`DELETE FROM movimiento_reparto WHERE movimiento_id = ${movimientoId}::uuid`
    await prisma.$executeRaw`UPDATE movimientos_bancarios SET desglosado = false WHERE id = ${movimientoId}::uuid`
    return NextResponse.json({ ok: true, desglosado: false })
  }

  // Validar: pisos reales, % > 0 y suma ≈ 100.
  const pisoRows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM properties`
  const pisosValidos = new Set(pisoRows.map(p => p.id))
  const limpios: RepartoIn[] = []
  for (const r of repartos) {
    const pct = Number(r.porcentaje)
    if (!pisosValidos.has(r.propiedad)) return NextResponse.json({ error: `Piso desconocido: ${r.propiedad}` }, { status: 400 })
    if (!(pct > 0)) return NextResponse.json({ error: 'Cada porcentaje debe ser mayor que 0' }, { status: 400 })
    limpios.push({ propiedad: r.propiedad, porcentaje: pct })
  }
  const suma = limpios.reduce((s, r) => s + r.porcentaje, 0)
  if (Math.abs(suma - 100) > 0.5) return NextResponse.json({ error: `Los porcentajes deben sumar 100% (suman ${suma.toFixed(1)}%)` }, { status: 400 })

  // Reemplazar el desglose: borrar e insertar el nuevo reparto.
  await prisma.$executeRaw`DELETE FROM movimiento_reparto WHERE movimiento_id = ${movimientoId}::uuid`
  for (const r of limpios) {
    const importe = Math.round(totalAbs * r.porcentaje) / 100
    await prisma.$executeRaw`
      INSERT INTO movimiento_reparto (movimiento_id, propiedad, porcentaje, importe)
      VALUES (${movimientoId}::uuid, ${r.propiedad}, ${r.porcentaje}, ${importe})
    `
  }
  await prisma.$executeRaw`UPDATE movimientos_bancarios SET desglosado = true WHERE id = ${movimientoId}::uuid`
  return NextResponse.json({ ok: true, desglosado: true })
}
