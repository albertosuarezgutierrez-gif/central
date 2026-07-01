import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/tarjeta?mes=YYYY-MM
// Devuelve un resumen de gastos de tarjeta de crédito para el mes indicado.
export async function GET(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const mes = req.nextUrl.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'mes debe ser YYYY-MM' }, { status: 400 })
  }

  const [anio, numMes] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fin = new Date(anio, numMes, 0).toISOString().slice(0, 10) // último día del mes

  const rows = await prisma.$queryRaw<Array<{
    cuenta_bancaria_id: string
    iban_mascara: string | null
    banco: string | null
    alias: string | null
    fecha_operacion: Date | null
    concepto: string | null
    importe: unknown
    destino: string | null
    destino_confirmado: boolean | null
    requiere_revision: boolean | null
    conciliado: boolean | null
    id: string
  }>>`
    SELECT mb.id, mb.cuenta_bancaria_id, cb.iban_mascara, cb.banco, cb.alias,
           mb.fecha_operacion, coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
           mb.importe, mb.destino, mb.destino_confirmado, mb.requiere_revision, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND cb.tipo = 'tarjeta'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    ORDER BY mb.fecha_operacion DESC, mb.importe ASC
  `

  // Agrupa por cuenta bancaria
  const porCuenta = new Map<string, {
    cuentaBancariaId: string
    ibanMascara: string | null
    banco: string | null
    alias: string | null
    totalGastado: number
    totalAbonado: number
    movimientos: typeof rows
    porDestino: Record<string, number>
    sinClasificar: number
  }>()

  for (const r of rows) {
    let entry = porCuenta.get(r.cuenta_bancaria_id)
    if (!entry) {
      entry = {
        cuentaBancariaId: r.cuenta_bancaria_id,
        ibanMascara: r.iban_mascara,
        banco: r.banco,
        alias: r.alias,
        totalGastado: 0,
        totalAbonado: 0,
        movimientos: [],
        porDestino: {},
        sinClasificar: 0,
      }
      porCuenta.set(r.cuenta_bancaria_id, entry)
    }
    const imp = Number(r.importe)
    if (imp < 0) entry.totalGastado += Math.abs(imp)
    else entry.totalAbonado += imp

    const dest = r.destino ?? 'sin_clasificar'
    entry.porDestino[dest] = (entry.porDestino[dest] ?? 0) + Math.abs(imp)

    if (!r.destino || r.requiere_revision) entry.sinClasificar++
    entry.movimientos.push(r)
  }

  const tarjetas = [...porCuenta.values()].map(t => ({
    ...t,
    topMovimientos: [...t.movimientos]
      .filter(m => Number(m.importe) < 0)
      .sort((a, b) => Number(a.importe) - Number(b.importe))
      .slice(0, 10)
      .map(m => ({
        id: m.id,
        fecha: m.fecha_operacion ? (m.fecha_operacion as Date).toISOString().slice(0, 10) : null,
        concepto: m.concepto,
        importe: Number(m.importe),
        destino: m.destino,
        destino_confirmado: m.destino_confirmado,
        conciliado: m.conciliado,
      })),
    todosMovimientos: t.movimientos.map((m: (typeof rows)[number]) => ({
      id: m.id,
      fecha: m.fecha_operacion ? (m.fecha_operacion as Date).toISOString().slice(0, 10) : null,
      concepto: m.concepto,
      importe: Number(m.importe),
      destino: m.destino,
      destino_confirmado: m.destino_confirmado,
      requiere_revision: m.requiere_revision,
      conciliado: m.conciliado,
    })),
    movimientos: undefined,
  }))

  return NextResponse.json({ mes, tarjetas })
}
