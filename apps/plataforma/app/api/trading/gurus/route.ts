import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { agregarConviccion } from '@central/module-trading'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from '@/lib/trading/dataroma'

// SELECCIÓN por CLONADO DE GURÚS (Fase B). Descarga la actividad 13F de varios gestores value desde
// Dataroma (egress de Vercel) y devuelve la CONVICCIÓN por símbolo: lo que VARIOS gestores están
// abriendo/ampliando a la vez sube arriba. NO opera ni persiste: prioriza QUÉ estudiar; los mejores
// entran al mismo /analizar (torneo + barreras + paper). SOLO paper — jamás órdenes reales.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { gestores, top } = (await req.json().catch(() => ({}))) as { gestores?: string[]; top?: number }
  const codigos = Array.isArray(gestores) && gestores.length ? gestores : GESTORES_DEFECTO

  // Descarga en paralelo; cada gestor degrada a [] si falla (best-effort).
  const porGestor = await Promise.all(codigos.map(async c => ({ gestor: c, movs: await movimientosGestorDataroma(c) })))
  const conActividad = porGestor.filter(g => g.movs.length > 0).map(g => g.gestor)
  const movimientos = porGestor.flatMap(g => g.movs)

  const ranking = agregarConviccion(movimientos)
  const n = typeof top === 'number' && top > 0 ? top : ranking.length

  return NextResponse.json({
    gestoresConsultados: codigos,
    gestoresConDatos: conActividad,     // si viene vacío en Vercel: revisar códigos/markup de Dataroma
    total: ranking.length,
    ranking: ranking.slice(0, n),
    nota: conActividad.length === 0 ? 'sin datos: verifica los códigos de gestor y el markup de Dataroma en producción' : undefined,
  })
}
