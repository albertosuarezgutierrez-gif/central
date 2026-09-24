import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTesoreria } from '@/lib/tesoreria'
import { getPLMensual } from '@/lib/sivra/pl-mensual'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/banca/analisis?mes=YYYY-MM&unico=1 — lo que necesita el plegable «Análisis y herramientas
// IA» de /banca: P&L por piso (benchmark) y previsión de tesorería. Se pide SOLO al abrir el plegable:
// `getTesoreria` recorre todo el histórico, y calcularlo en cada visita (plegado y sin mirar) era el
// peso muerto de la página. `null` en un campo = no se pudo calcular (se dice), nunca «vacío».
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const mes = url.searchParams.get('mes') ?? ''
  const unico = url.searchParams.get('unico') === '1' && /^\d{4}-\d{2}$/.test(mes)

  const [pl, tes] = await Promise.all([
    unico ? getPLMensual(mes).catch(e => { console.error('[banca/analisis] pl', e); return null }) : Promise.resolve(undefined),
    getTesoreria(session.id).catch(e => { console.error('[banca/analisis] tesoreria', e); return null }),
  ])

  return NextResponse.json({
    // `undefined` → el periodo no es un único mes (no aplica); `null` → falló.
    pisos: pl === undefined ? undefined : pl === null ? null : pl.pisos.map(p => ({
      propertyId: p.propertyId, nombre: p.nombre, reservas: p.reservas, ingresos: p.ingresos,
      gastosTotal: p.gastos.total, resultado: p.resultado, margen: p.margen,
    })),
    tesoreria: tes === null ? null : {
      proyecciones: tes.proyecciones.map(p => ({ dias: p.dias, proyectado: p.proyectado, entradas: p.entradas, salidas: p.salidas })),
      recurrentes: tes.recurrentes.slice(0, 8).map(r => ({ clave: r.clave, concepto: r.concepto, intervaloDias: r.intervaloDias, ocurrencias: r.ocurrencias, importeMedio: r.importeMedio })),
      hayRecurrentes: tes.recurrentes.length > 0,
    },
  })
}
