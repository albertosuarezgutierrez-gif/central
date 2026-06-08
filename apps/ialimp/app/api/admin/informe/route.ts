import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const PROP_NAMES: Record<string,string> = {
  prop_house_sevillana: 'House Sevillana',
  prop_duplex_center: 'Dúplex Center',
  prop_luxury_busto: 'Luxury Busto',
  prop_busto_reform: 'Busto Reform',
}

function durMin(s: any): number {
  if (s.hora_llegada && s.hora_salida)
    return Math.round((new Date(s.hora_salida).getTime() - new Date(s.hora_llegada).getTime()) / 60000)
  if (s.started_at && s.completed_at)
    return Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000)
  return s.tiempo_estimado || 0
}

function fmtHM(min: number): string {
  if (!min) return '—'
  return `${Math.floor(min/60)}h ${min%60}m`
}

function fmtTs(ts: string|null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lid = searchParams.get('lid')!
  const from = searchParams.get('from')!
  const to = searchParams.get('to')!

  const limp = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM limpiadoras WHERE id = ${lid}::uuid`)
  const sessions = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cs.*,
      (SELECT COUNT(*) FROM session_completions sc WHERE sc.session_id = cs.id AND sc.photo_url IS NOT NULL) as n_fotos
    FROM cleaning_sessions cs
    WHERE cs.limpiadora_id = ${lid}::uuid
      AND cs.session_date BETWEEN ${from}::date AND ${to}::date
    ORDER BY cs.session_date
  `)
  const tarifa = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM tarifas_limpiadoras
    WHERE limpiadora_id = ${lid}::uuid AND property_id = '__all__' AND activo = true
    LIMIT 1
  `)

  if (!limp.length) return NextResponse.json({ error: 'Limpiadora no encontrada' }, { status: 404 })

  const l = limp[0]
  const t = tarifa[0]
  let totalMin = 0, totalFotos = 0
  const rows = (sessions as any[]).map(s => {
    const min = durMin(s)
    totalMin += min
    totalFotos += Number(s.n_fotos || 0)
    const done = !!s.completed_at
    return `
      <tr>
        <td>${new Date(s.session_date).toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short' })}</td>
        <td>${PROP_NAMES[s.property_id] || s.property_id}</td>
        <td>${s.tipo_limpieza || 'estándar'}</td>
        <td>${fmtTs(s.hora_llegada)}</td>
        <td>${fmtTs(s.hora_salida || s.completed_at)}</td>
        <td style="font-weight:600">${fmtHM(min)}</td>
        <td style="color:${done?'#16a34a':'#f59e0b'}">${done ? '✓' : '○'}</td>
        <td>${s.n_fotos || 0} 📸</td>
      </tr>`
  }).join('')

  const numSes = sessions.length
  const totalH = (totalMin / 60).toFixed(1)
  let importeHtml = ''
  if (t) {
    const importe = t.tipo === 'hora'
      ? ((totalMin / 60) * Number(t.importe)).toFixed(2)
      : (numSes * Number(t.importe)).toFixed(2)
    const formula = t.tipo === 'hora'
      ? `${totalH}h × ${t.importe}€/h`
      : `${numSes} sesiones × ${t.importe}€/sesión`
    importeHtml = `
      <div class="importe">
        <span>IMPORTE: ${formula} = <strong>${importe} €</strong></span>
      </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe — ${l.nombre}</title>
<style>
  body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin: 32px 40px; color: #111; }
  h1 { color: #1B4332; margin: 0 0 4px; font-size: 22px }
  .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px }
  table { width: 100%; border-collapse: collapse; font-size: 13px }
  th { background: #1B4332; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600 }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0 }
  tr:hover td { background: #f9fdf9 }
  tfoot td { background: #f0fdf4; font-weight: 700; border-top: 2px solid #1B4332 }
  .importe { margin-top: 20px; background: #e7f5ee; border: 1px solid #a3e635; border-radius: 10px; padding: 14px 20px; font-size: 16px; display: inline-block }
  .print-btn { margin-bottom: 20px; background: #1B4332; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600 }
  @media print { .print-btn { display: none } @page { margin: 20mm } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
<h1>Informe de Limpieza — ${l.nombre}</h1>
<div class="sub">Período: ${from} → ${to} &nbsp;·&nbsp; Generado: ${new Date().toLocaleDateString('es-ES')}</div>
<table>
  <thead>
    <tr><th>Fecha</th><th>Piso</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th>Duración</th><th>Estado</th><th>Fotos</th></tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="5">TOTALES</td>
      <td>${fmtHM(totalMin)}</td>
      <td>${numSes} sesiones</td>
      <td>${totalFotos} 📸</td>
    </tr>
  </tfoot>
</table>
${importeHtml}
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
