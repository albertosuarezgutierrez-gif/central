import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { competitividadAsegura } from '@/lib/companias-asegura'
import { interpretarCompetitividad } from '@/lib/competitividad-companias'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/companias/competitividad?anio=YYYY — competitividad de precio por compañía, ramo y nivel de
 * cobertura sobre las tarificaciones guardadas (asegura). Viaja con su propio estado: si falla, el cuadro de mando se
 * pinta igual y el bloque dice «no se ha podido calcular», nunca «0 %».
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const actual = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))
  const n = Number(req.nextUrl.searchParams.get('anio'))
  const anio = Number.isInteger(n) && n >= 2000 && n <= actual ? n : actual
  const puerto = await competitividadAsegura(anio)
  return NextResponse.json({ anio, competitividad: interpretarCompetitividad(puerto.status, puerto.json) })
}
