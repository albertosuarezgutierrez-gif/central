import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getMovimientosExport } from '@/lib/banca'
import { DESTINO_LABEL, type Destino } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'

// GET /api/banca/export — descarga todos los movimientos de la cuenta en CSV (separador ';'
// y coma decimal, el formato que abre Excel español sin tocar nada) para enviárselo al gestor.
function csvCell(v: string): string {
  // Comillas si hay separador, comilla o salto de línea; las comillas internas se duplican.
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function GET(_req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const movs = await getMovimientosExport(session.id)
  const cabecera = ['Fecha', 'Valor', 'Sociedad', 'Banco', 'Concepto', 'Contraparte', 'Categoría', 'Cuenta PGC', 'Negocio', 'Importe (€)', 'Conciliado']
  const lineas = [cabecera.join(';')]
  for (const m of movs) {
    lineas.push([
      m.fecha ?? '', m.valor ?? '', m.sociedad, m.banco ?? '', m.concepto, m.contraparte ?? '',
      m.categoria ?? '', m.categoriaPgc ?? '',
      m.destino ? (DESTINO_LABEL[m.destino as Destino] ?? m.destino) : '',
      m.importe.toFixed(2).replace('.', ','),
      m.conciliado ? 'Sí' : 'No',
    ].map(c => csvCell(String(c))).join(';'))
  }
  // BOM para que Excel detecte UTF-8 (acentos correctos).
  const csv = '﻿' + lineas.join('\r\n')
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="movimientos-${fecha}.csv"`,
    },
  })
}
