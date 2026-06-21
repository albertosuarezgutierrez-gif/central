import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const limpiadora_id = searchParams.get('limpiadora_id')
    const mes = searchParams.get('mes') || new Date().toISOString().slice(0,7)
    const [year, month] = mes.split('-').map(Number)
    const inicio = new Date(year, month-1, 1).toISOString().split('T')[0]
    const fin    = new Date(year, month, 0).toISOString().split('T')[0]

    const registros = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.session_date::text AS fecha,
        cs.property_name,
        cs.hora_llegada::text AS hora_entrada,
        cs.hora_salida::text  AS hora_salida,
        ROUND(EXTRACT(EPOCH FROM (cs.hora_salida - cs.hora_llegada))/3600.0, 2) AS horas,
        l.nombre AS limpiadora
      FROM cleaning_sessions cs
      JOIN limpiadoras l ON l.id = cs.limpiadora_id
      WHERE cs.empresa_id = ${empresa_id}::uuid
        ${limpiadora_id ? Prisma.sql`AND cs.limpiadora_id = ${limpiadora_id}::uuid` : Prisma.sql``}
        AND cs.session_date BETWEEN ${inicio}::date AND ${fin}::date
        AND cs.hora_llegada IS NOT NULL AND cs.hora_salida IS NOT NULL
      ORDER BY l.nombre, cs.session_date
    `)

    // Generar HTML para impresión / PDF
    const totalHoras = registros.reduce((a, r) => a + Number(r.horas || 0), 0)
    const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial;margin:32px;font-size:12px}' +
      'h1{color:#4f46e5;font-size:18px}table{width:100%;border-collapse:collapse}' +
      'th{background:#4f46e5;color:white;padding:8px;text-align:left}' +
      'td{padding:8px;border-bottom:1px solid #e2e8f0}' +
      '.total{font-weight:700;background:#eef2ff}' +
      '@media print{button{display:none}}</style></head><body>' +
      '<button onclick="window.print()" style="background:#4f46e5;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;margin-bottom:16px">🖨️ Imprimir / Guardar PDF</button>' +
      '<h1>Registro de jornada laboral</h1>' +
      '<p style="color:#64748b">Período: ' + mes + ' | Total horas: ' + totalHoras.toFixed(1) + 'h</p>' +
      '<table><tr><th>Fecha</th><th>Trabajadora</th><th>Propiedad</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr>' +
      registros.map(r => '<tr><td>' + r.fecha + '</td><td>' + r.limpiadora + '</td><td>' + (r.property_name||'—') + '</td><td>' + (r.hora_entrada||'—').slice(0,5) + '</td><td>' + (r.hora_salida||'—').slice(0,5) + '</td><td>' + (r.horas||0) + 'h</td></tr>').join('') +
      '<tr class="total"><td colspan="5">TOTAL</td><td>' + totalHoras.toFixed(1) + 'h</td></tr>' +
      '</table><p style="margin-top:24px;color:#94a3b8;font-size:11px">Documento generado por ialimp conforme al Real Decreto-ley 8/2019 de registro de jornada</p></body></html>'

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
