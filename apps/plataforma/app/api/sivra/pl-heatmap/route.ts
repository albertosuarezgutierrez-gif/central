import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getHeatmapMeses } from '@/lib/sivra/pl-rango'

export const dynamic = 'force-dynamic'
// 24 pasadas de P&L la primera vez (luego caché por mes) — endpoint PEREZOSO a propósito:
// solo lo pide la sección de estacionalidad al abrirse.
export const maxDuration = 120

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const meses = await getHeatmapMeses(24)
    // Solo lo que el heatmap pinta (margen/resultado/ingresos por piso y mes): la respuesta
    // completa de 24 P&L pesaría sin aportar.
    return NextResponse.json({
      meses: meses.map(m => ({
        mes: m.mes,
        pisos: m.pisos.map(p => ({
          propertyId: p.propertyId, nombre: p.nombre,
          ingresos: p.ingresos, resultado: p.resultado, margen: p.margen,
        })),
      })),
    })
  } catch (err) {
    console.error('[pl-heatmap]', err)
    return NextResponse.json({ error: 'Error calculando el heatmap' }, { status: 500 })
  }
}
