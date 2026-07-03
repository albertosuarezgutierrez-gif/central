import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { calcularEstadoDeclaracion } from '@/lib/comparativa-declaracion'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/comparativa?year= — estado de la declaración HOY y a FIN DE AÑO,
// cada uno en las dos modalidades (solo titular vs conjunta con el cónyuge).
// Pensado para responder la pregunta operativa: "¿cómo voy y cómo acabaría? ¿me
// interesa meter más gasto deducible antes del 31/12?"
// El cálculo vive en lib/comparativa-declaracion.ts (compartido con el SSR de
// /finanzas/fiscal). Esta ruta sirve el recálculo al cambiar de año en el cliente.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    const estado = await calcularEstadoDeclaracion(session.id, year)
    return NextResponse.json(estado)
  } catch (e) {
    console.error('[/api/finanzas/comparativa]', e)
    return NextResponse.json({ error: 'Error al calcular comparativa' }, { status: 500 })
  }
}
