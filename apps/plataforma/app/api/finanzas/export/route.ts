import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  const rows = await prisma.$queryRaw<Array<{
    fecha_operacion: Date | null
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    categoria: string | null
    destino: string | null
    importe: unknown
    banco: string | null
    sociedad: string
  }>>`
    SELECT mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
           mb.categoria, mb.destino, mb.importe, cb.banco,
           s.nombre AS sociedad
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND mb.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
    ORDER BY mb.fecha_operacion ASC NULLS LAST
  `

  const dest: Record<string, string> = {
    seguros: 'Correduría seguros',
    turistico_pisos: 'Pisos turísticos (Kutxa)',
    turistico_duplex: 'Duplex Center (BBVA)',
  }

  const lines = [
    'Fecha,Concepto,Importe,Categoría,Actividad,Banco,Sociedad,Deducible',
    ...rows.map(r => {
      const concepto = (r.concepto_normalizado || r.concepto || r.contraparte || '').replace(/,/g, ' ')
      const actividad = dest[r.destino ?? ''] ?? r.destino ?? ''
      const cat = (r.categoria ?? '').replace(/,/g, ' ')
      const banco = (r.banco ?? '').replace(/,/g, ' ')
      const soc = r.sociedad.replace(/,/g, ' ')
      const importe = Number(r.importe).toFixed(2).replace('.', ',')
      return `${r.fecha_operacion?.toISOString().slice(0, 10) ?? ''},"${concepto}",${importe},"${cat}","${actividad}","${banco}","${soc}",Sí`
    }),
  ]

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finanzas-${year}.csv"`,
    },
  })
}
